# Engineering Review — Mini Campaign Manager (as-built)

**Review date:** 2026-04-24
**Scope:** Engineering quality of code that exists today — architecture, data flow, edge cases, tests, performance, error handling, security.
**Out of scope:** Requirements-compliance gaps (covered separately in `COMPLIANCE_AUDIT.md`).

## TL;DR

The code is readable and the happy path works. Three structural problems put correctness at risk even before the requirements gaps are fixed:

1. **The send endpoint has a concurrency hole.** `POST /campaigns/:id/send` reads status, opens a transaction, then updates — no row lock, no atomic compare-and-swap. Two concurrent sends both pass the gate.
2. **The test suite is false confidence.** Every test runs raw SQL. Zero tests hit the route handlers. The "prevents deleting" test never calls DELETE — it asserts a JavaScript boolean on a DB read. These tests would pass if the routes returned 500 for every request.
3. **The hot paths hold a pool connection through serial `await` loops.** Create and send both loop per-recipient with one query each, holding a pooled connection for the duration. At 500 recipients with 2ms latency that's a 1-second hold per request; 10 concurrent sends exhaust the default `pg` pool and block everything else.

All three are fixable in under an hour each. Details below.

---

## 1. Architecture & Separation of Concerns

**Severity: P3 (confidence: 9/10)**

`CLAUDE.md §1` explicitly says *"Routes handle HTTP, services hold business logic, repositories touch the database."* The current code violates this — every route in `backend/src/routes/campaigns.ts` reaches directly into `pool.query(...)`. No service layer, no repo layer.

**Why this matters in practice, not in theory:** the tenant-isolation filter `AND created_by = $2` is duplicated across six routes (lines 115, 144, 191, 217, 245, 302). Adding a seventh route that forgets the filter is a cross-tenant read/write bug. A `CampaignRepository.findForUser(userId, id)` method would make that bug structurally impossible — one place owns the filter.

**At this scope (take-home, ~300 lines of routes), the flat structure is acceptable.** Flag as technical debt for any real deployment. The fix is low-risk:
- `src/repositories/campaigns.ts` — own the SQL
- `src/services/campaigns.ts` — own the business rules (draft-guard, scheduled_at validation, status transitions)
- Routes shrink to: validate, call service, map errors to HTTP

**Recommendation:** ship as-is for the exercise, note the debt. If this code were landing in production, I would require the refactor before merge.

---

## 2. Data Flow

### 2a. JWT in Redux, lost on refresh

**Severity: P2 UX (confidence: 10/10)**

`frontend/src/store/authSlice.ts:9-12` initializes `{user: null, token: null}` unconditionally. Nothing rehydrates from `localStorage` or a cookie. Every browser refresh = forced re-login. `CLAUDE.md §11` flagged this as a documented choice; the code didn't document it or implement the mitigation.

**Fix options, ordered by effort:**
- Serialize `auth` slice to `localStorage` on change, rehydrate at store init. 15 minutes. Vulnerable to XSS.
- Use an httpOnly cookie set by `/auth/login`, drop the Redux token entirely, rely on `credentials: include` + a cookie-backed `/auth/me` call to populate `auth.user`. 1-2 hours. CSRF protection needed.

For a take-home, the localStorage pattern is fine *if documented*.

### 2b. No global 401 interceptor

**Severity: P2 UX (confidence: 9/10)**

`frontend/src/api/client.ts:17-20` throws a generic `Error` on any non-2xx. When a JWT expires (`24h` per `middleware/auth.ts:27`), the user sees "Invalid or expired token" somewhere in a red banner but is still sitting on a protected route with a stale `user` in Redux.

Fix: in the `request` wrapper, on 401, dispatch `logout()` and redirect to `/login`. Or wire an axios-style response interceptor.

### 2c. Transaction scope in send pipeline

**Severity: P1 correctness (confidence: 9/10)** — see Edge Cases §3a below. The status check happens outside the transaction. Move it in, or replace with an atomic CAS.

### 2d. React Query cache keys

**Severity: minor**

`CampaignDetail.tsx` invalidates `["campaign", id]`, `["campaign-stats", id]`, and `["campaigns"]` on mutations — good. But the campaigns list uses `["campaigns"]` without page/limit parameters, which means paginated pages share a key. Not a bug (React Query handles it), but if the list query key becomes `["campaigns", page, limit]` later, invalidation will stop working. Consider `queryClient.invalidateQueries({ queryKey: ["campaigns"] })` with `exact: false` (the default) to stay safe.

---

## 3. Edge Cases — the danger zone

### 3a. Double-send race — **P1 real bug**

**File:** `backend/src/routes/campaigns.ts:242-295` (confidence: 10/10)

```
Thread A: SELECT campaign (status='draft')    ← line 244
Thread B: SELECT campaign (status='draft')    ← both see draft
Thread A: BEGIN + loop updates + status='sent'
Thread B: BEGIN + loop updates + status='sent'  ← passes, no lock
```

There is no `SELECT ... FOR UPDATE`, no serializable isolation, no atomic compare-and-swap. Two simultaneous send requests both enter their transactions. The recipient updates are self-serializing on row-level locks (second transaction's `WHERE status='pending'` sees zero rows after first commits), but the final `UPDATE campaigns SET status='sent'` fires twice, and `updated_at` is clobbered. More importantly, the **business invariant "send is one-way"** is only accidentally preserved, not enforced.

**Fix — atomic compare-and-swap gate:**

```sql
UPDATE campaigns
   SET status='sending', updated_at=NOW()
 WHERE id=$1 AND created_by=$2 AND status IN ('draft','scheduled')
 RETURNING *;
```

If zero rows returned → respond 409. Else proceed. This is atomic and race-free.

(This also correctly introduces the `sending` intermediate state that `CLAUDE.md §7` requires.)

### 3b. Partial-send rollback loses real-world state

**File:** `campaigns.ts:258-295` (confidence: 8/10)

The entire send is wrapped in one transaction. If recipient #73's UPDATE fails, everything rolls back — no recipients get marked sent, campaign stays draft. For a simulated demo that's acceptable. For a real email provider it's wrong: emails actually went out for recipients 1-72, and the DB now lies about that.

**Recommendation for the demo:** document the semantic in the README ("send is atomic — all or nothing, by design, because this is simulation"). For production: per-recipient commits, or an outbox pattern with a worker.

### 3c. Double-submit from UI

**Severity: minor (confidence: 7/10)**

`CampaignDetail.tsx:107` disables the Send button via `sendMutation.isPending` — correct. But `:135` uses `window.confirm()` before triggering delete; a user who double-clicks after confirming can potentially fire two requests before React re-renders. Backend idempotency (404 on second DELETE after the first destroys the row) saves us here.

### 3d. Clock skew on `scheduled_at`

**Severity: trivial**

`validation/schemas.ts:28-34` validates `date > new Date()` — both dates are resolved on the server so there's no skew *within* that check. But the frontend's `<input type="datetime-local">` submits local-time ISO without timezone offset, so a user in UTC+9 could submit `2026-04-24T10:00:00` intending 1am UTC and the server parses it as local server time. Timezone ambiguity, not a bug per se, but a UX landmine.

### 3e. Unbounded recipient lists — **P2**

**File:** `validation/schemas.ts:18` (confidence: 9/10)

`recipientEmails: z.array(z.string().email()).min(1)` — no `.max()`. A POST with 100,000 emails triggers:
- 200,000 DB round-trips in `campaigns.ts:66-83` (upsert recipient + insert cr)
- Transaction open for minutes
- Pool connection held the whole time
- Likely OOM on the Node side

**Fix:** `.max(1000)` on the schema. Cheap, prevents resource exhaustion.

### 3f. Zod `safeParse` dropping vs passthrough

**Severity: P2 architectural footgun (confidence: 9/10)**

`campaigns.ts:162-168` iterates `Object.entries(parsed.data)` to construct SQL field names. This is safe *today* because `updateCampaignSchema` (schemas.ts:21-25) is a strict `z.object` that drops unknown keys — so even if the client sends `{"status": "sent"}` or `{"; DROP TABLE campaigns; --": 1}`, those keys never reach the loop.

**But this is load-bearing on Zod's default behavior.** If someone later adds `.passthrough()` or switches to `z.record()`, the loop happily builds SQL fragments from attacker-controlled keys. That's a second-order SQL injection.

**Defense-in-depth fix:**
```ts
const ALLOWED_FIELDS = ['name', 'subject', 'body'] as const;
for (const key of ALLOWED_FIELDS) {
  if (updates[key] !== undefined) { fields.push(`${key} = $${idx}`); ... }
}
```

This way the SQL shape is fixed in code, not derived from validator output.

### 3g. Empty PATCH payload silently no-ops

**File:** `campaigns.ts:170-172` (confidence: 9/10)

`PATCH /campaigns/:id` with body `{}` passes Zod validation (every field is `.optional()`), then hits `if (fields.length === 0) return res.json(campaign)` — returns 200 with the unchanged record. Technically fine, but a client bug that sends an empty patch will never surface. Prefer 400 "No updatable fields provided."

---

## 4. Test Coverage — **P1 false confidence**

**File:** `backend/tests/campaigns.test.ts` (confidence: 10/10)

Every test in this file runs raw SQL. **Not one test calls a route handler.** The JWT middleware, the Zod validation, the HTTP status codes, the response shapes — none of it is exercised.

Example — the "prevents deleting a non-draft campaign" test at lines 114-126:

```ts
const { rows: [campaign] } = await pool.query("SELECT status FROM campaigns WHERE id = $1", [id]);
expect(campaign.status).toBe("scheduled");
const canDelete = campaign.status === "draft";
expect(canDelete).toBe(false);
```

This asserts that a scheduled campaign has status "scheduled", and that a JavaScript boolean is `false`. It never issues a DELETE. **This test would pass if the DELETE route returned 200 and destroyed the database.**

The stats test (lines 161-211) is the only one with any meaningful SQL, but it recomputes `open_rate` and `send_rate` in the test body instead of asserting the route's output — so it cannot catch the live bug where the route divides by `total` instead of `sent` (`campaigns.ts:333`).

**This is not a small finding.** The COMPLIANCE_AUDIT listed "≥ 3 tests" as ✅ on quantity. On substance, the test suite is indistinguishable from zero tests for catching regressions in the code people will actually change.

### Coverage diagram

```
CODE PATHS                                              USER FLOWS
[+] POST /campaigns/:id/send                            [+] Send a draft campaign
  ├── status=sent → 400 (should be 409)                   ├── [GAP] [→E2E] Send happy path
  │   [GAP] never tested via HTTP                         └── [GAP] [→E2E] Send already-sent → 409
  ├── concurrent sends race                               [+] Edit/schedule/delete guards
  │   [GAP] not tested at all — P1                        ├── [GAP] [→E2E] PATCH non-draft → 409
  └── partial failure rollback                            ├── [GAP] [→E2E] Schedule past date → 422
      [GAP] not tested                                    └── [GAP] [→E2E] DELETE non-draft → 409
[+] PATCH /campaigns/:id                                [+] Cross-tenant isolation
  ├── non-draft → 400                                     └── [GAP] [→E2E] User B's campaign → 404
  │   [★ smoke] — asserts SQL filter, not route
  └── dynamic field construction                        [+] Auth
      [GAP] not tested                                    ├── [GAP] [→E2E] Missing token → 401
[+] GET /campaigns/:id/stats                              └── [GAP] [→E2E] Expired token → 401
  ├── empty recipient list → all zeros
  │   [★★ happy] — via SQL, not route
  └── divide-by-zero on sent=0
      [GAP] route formula wrong; test can't catch it

COVERAGE: 2/14 paths meaningfully tested (14%)
QUALITY: ★★:1  ★:1  GAPS: 12 (10 E2E-worthy)
```

### Required additions (non-negotiable for the project's stated DoD)

Using `supertest` or `fetch` against a running test server:

1. PATCH on a `scheduled` campaign → 409 with error body
2. DELETE on a `scheduled` campaign → 409
3. Schedule with `scheduled_at` in the past → 422
4. POST /send twice in quick succession → second returns 409 (regression test for the concurrency fix)
5. GET /campaigns/:id belonging to another user → 404 (cross-tenant)
6. GET /campaigns without `Authorization: Bearer` → 401
7. GET /campaigns/:id/stats against a campaign with 0 recipients → `{total:0, sent:0, open_rate:0, send_rate:0}` (no divide-by-zero)

This is ~90 minutes of work and turns the test suite from decoration into a safety net.

---

## 5. Performance

### 5a. Serial await loop in send — **P1**

**File:** `campaigns.ts:270-278` (confidence: 10/10)

```ts
for (const r of recipients) {
  const failed = Math.random() < 0.1;
  await client.query(`UPDATE campaign_recipients SET ...`, [...]);
}
```

**Problem 1 — latency:** N recipients × RTT = total send time. 500 recipients at 1ms local latency = 500ms. In a real network (5-10ms) with 1000 recipients = 5-10s per send.

**Problem 2 — pool exhaustion:** this loop holds one `pool.connect()` connection the entire time. Default `pg` pool = 10. Ten concurrent sends of 1000 recipients each occupy all 10 connections for 5-10s. All other requests (including auth) stall.

**Fix — single query:**

```sql
UPDATE campaign_recipients
   SET status = CASE WHEN random() < 0.9 THEN 'sent' ELSE 'failed' END,
       sent_at = CASE WHEN random() < 0.9 THEN NOW() ELSE NULL END,
       opened_at = CASE WHEN random() < 0.3 THEN NOW() ELSE NULL END  -- bonus: simulate opens
 WHERE campaign_id = $1 AND status = 'pending';
```

One query, atomic, no loop, solves the open-rate problem too. The random values are independent per row because PostgreSQL evaluates `random()` per-row in a CASE — verify with `EXPLAIN` if paranoid.

### 5b. Serial loop in campaign create

**File:** `campaigns.ts:66-83` (confidence: 9/10)

Same shape: 2 queries × N recipients. Same fix:

```sql
-- Bulk upsert recipients
INSERT INTO recipients (email, name)
SELECT unnest($1::text[]), unnest($2::text[])
ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
RETURNING id, email;

-- Bulk link
INSERT INTO campaign_recipients (campaign_id, recipient_id)
SELECT $1, id FROM recipients WHERE email = ANY($2::text[])
ON CONFLICT DO NOTHING;
```

### 5c. List query: 2 round-trips

**File:** `campaigns.ts:21-37`

Pattern (data + count) is idiomatic and fine. Minor optimization using `COUNT(*) OVER ()` is available but not worth the complexity at this scope.

### 5d. Stats query

**File:** `campaigns.ts:311-322`

Single aggregation using PostgreSQL `FILTER` clauses — this is the right pattern. Index `idx_campaign_recipients_campaign_id` covers it. ✅

---

## 6. Error Handling

### 6a. Unwrapped async route handlers

**Severity: P2 (confidence: 8/10)**

Express 4 does not forward rejected promises from async handlers to the error middleware. If any `await pool.query(...)` throws (e.g., connection lost, constraint violation with no `try/catch`), it becomes an unhandled promise rejection. Node will log `UnhandledPromiseRejectionWarning` and eventually (Node 15+) crash the process.

The send and create routes have try/catch/rollback — good. But `GET /`, `GET /:id`, `PATCH`, `DELETE`, `POST /:id/schedule`, `GET /:id/stats` — none of these wrap in try/catch. A DB hiccup during a list query crashes the server.

**Fix:** install `express-async-errors` (one import at the top of `index.ts`) or wrap handlers with an `asyncHandler` helper. 5 minutes.

### 6b. Generic 500 leaks no information to ops

**File:** `index.ts:20-23`

`console.error(err.stack)` to stdout is dev-grade logging. No request ID, no user ID, no route, no timestamp. For a take-home this is fine — flag as minor.

### 6c. Error response shape inconsistency

- Auth register/login: `{error, details}` (with Zod flatten) — good
- Campaigns PATCH/POST with validation: same shape — good
- Campaigns other routes: `{error}` only — fine
- Global 500: `{error: "Internal server error"}` — generic, OK

Consistent enough. The one thing to flag: the `details` field is only populated on Zod failures. Clients can't rely on it always being present.

---

## 7. Security

### 7a. JWT secret silent fallback — **P2**

**File:** `middleware/auth.ts:4` (confidence: 10/10)

```ts
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
```

If `JWT_SECRET` is unset in production, the service silently signs with a known public string. Anyone who reads the source can forge a token. Production deployments that forget to set the env var become instantly trivial to compromise.

**Fix:**
```ts
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}
```

Or simpler: always require it, fail fast on startup.

### 7b. No rate limiting on auth

**Severity: P3 (confidence: 9/10)**

`POST /auth/login` and `POST /auth/register` have no rate limit. A script can brute-force passwords (6-char minimum!) at whatever rate the DB + bcrypt tolerate. bcrypt rounds=10 limits this to ~10-20 attempts/sec per CPU — not zero protection, but an attacker with 24h gets millions of tries.

**Fix:** `express-rate-limit` — 10 lines, 10 req/min per IP on auth endpoints. Note: behind a reverse proxy you need `app.set('trust proxy', 1)`.

### 7c. bcrypt rounds = 10

**Severity: minor (confidence: 8/10)**

**File:** `routes/auth.ts:22`. OWASP currently recommends 12+ for bcrypt. 10 is legacy-acceptable; 12 adds ~200ms per login on modern hardware.

### 7d. Password minimum = 6 chars

**File:** `validation/schemas.ts:6`. OWASP: 8 minimum, 12 recommended. Flag.

### 7e. PATCH dynamic SQL: safe today, fragile

See §3f above. Safe because Zod drops unknown keys. Switch to an explicit column whitelist to eliminate the dependency.

### 7f. CORS

**File:** `index.ts:9`. Single origin from env, no credentials. Correct for JWT-in-Authorization-header. If you move to httpOnly cookies, you must add `credentials: true` and tighten the origin check.

### 7g. Parameterized queries

✅ Every query I read uses `$N` placeholders. No string interpolation of user input into SQL.

### 7h. Password hashing

✅ bcrypt on store (`auth.ts:22`), bcrypt.compare on check (`auth.ts:45`), `password_hash` never returned (`auth.ts:26`, `auth.ts:51`).

---

## Ranked findings

| # | Severity | Conf | File:Line | Finding |
|---|----------|------|-----------|---------|
| 1 | P1 | 10/10 | `routes/campaigns.ts:244-289` | Double-send race — no lock or atomic CAS on status transition |
| 2 | P1 | 10/10 | `tests/campaigns.test.ts` | All tests bypass HTTP layer; `lines 114-126` never calls DELETE |
| 3 | P1 | 10/10 | `routes/campaigns.ts:270-278` | Serial await loop holds pool connection; exhaustion risk |
| 4 | P2 | 10/10 | `middleware/auth.ts:4` | JWT secret falls back to dev value silently |
| 5 | P2 | 9/10 | `routes/campaigns.ts:162-168` | Dynamic SQL field construction depends on Zod's drop-extras behavior |
| 6 | P2 | 8/10 | All non-send/create routes | Async handlers unwrapped — unhandled rejection crashes server |
| 7 | P2 | 9/10 | `schemas.ts:18` | `recipientEmails` has no `.max()` — resource exhaustion vector |
| 8 | P2 | 10/10 | `store/authSlice.ts:9-12` | JWT lost on browser refresh — no rehydration |
| 9 | P2 | 9/10 | `api/client.ts:17-20` | No global 401 handler — expired token = silent stale state |
| 10 | P3 | 9/10 | `routes/auth.ts` | No rate limiting on login/register |
| 11 | P3 | 8/10 | `routes/auth.ts:22` | bcrypt rounds=10, below current OWASP guidance |
| 12 | P3 | 9/10 | `schemas.ts:6` | Password min=6 chars |
| 13 | P3 | 9/10 | All routes | No service/repo layer — tenant filter duplicated 6x |

---

## Failure modes — realistic production scenarios

| Path | Failure | Tested? | Handled? | User sees? |
|------|---------|---------|----------|------------|
| POST /send (concurrent) | Double-send race (#1) | ❌ | ❌ | Partial/duplicated state, no error |
| POST /send (N=1000) | Pool exhaustion (#3) | ❌ | ❌ | All other requests time out |
| POST /campaigns (N=100k) | OOM / DB transaction timeout (#7) | ❌ | ❌ | Hang, then 500 |
| JWT expires mid-session | 401 propagates as generic error (#9) | ❌ | ⚠️ partial | Red banner, app feels broken |
| Missing JWT_SECRET in prod (#4) | Silent fallback to known secret | ❌ | ❌ | Nothing — security wide open |
| DB hiccup during GET /campaigns | Unhandled promise rejection (#6) | ❌ | ❌ | Server crashes |
| Recipient email list = 100k | Hung request, OOM | ❌ | ❌ | Spinner forever, eventual 500 |

**Critical gaps** (no test + no handling + silent user experience): #1, #3, #4, #6, #7.

---

## What already exists (that should be reused)

- Zod schemas (`validation/schemas.ts`) — keep; add `.max(1000)` to recipient array
- Transaction scaffolding in campaign create + send — reuse the pattern when extracting to a service
- `authenticate` middleware — reuse as-is after JWT secret fix
- PostgreSQL `FILTER` aggregation in stats — idiomatic and efficient, keep
- React Query cache invalidation pattern in `CampaignDetail.tsx:28-32` — good, generalize to a reusable `useInvalidate(campaignId)` hook if more pages use it

---

## NOT in scope for this review

- Migrating `pg` → Sequelize (tracked in COMPLIANCE_AUDIT)
- Adding yarn workspaces (tracked in COMPLIANCE_AUDIT)
- Writing README / "How I Used Claude Code" (tracked in COMPLIANCE_AUDIT)
- Adding `/recipients` endpoints (tracked in COMPLIANCE_AUDIT)
- Adding `sending` status end-to-end (tracked in COMPLIANCE_AUDIT)
- Fixing status codes 400 → 409 / 422 (tracked in COMPLIANCE_AUDIT)
- Open-rate formula fix (tracked in COMPLIANCE_AUDIT)

Everything above belongs to the requirements-compliance track. This review focuses on *structural* engineering quality, even where the spec is silent.

---

## Parallelization strategy for remediation

Two largely independent work lanes:

**Lane A — correctness (backend):** #1 concurrency fix → #3 bulk updates → #6 async wrapper → #7 schema `.max()`. Sequential, all in `routes/campaigns.ts`.

**Lane B — auth hardening (backend):** #4 JWT secret → #10 rate limiting → #11 bcrypt rounds → #12 password min. Sequential, all in `auth.ts` / `middleware/auth.ts` / `schemas.ts`.

**Lane C — tests (backend, blocked by A):** write supertest suite covering the 7 bullets in §4. Blocked by A because the concurrency test depends on the atomic-CAS fix landing first.

**Lane D — frontend UX:** #8 JWT rehydration → #9 global 401 interceptor. Independent of A/B/C.

Launch A, B, D in parallel. C follows A.

---

## Completion summary

- Scope Challenge: as-built review, no reduction needed
- Architecture Review: 1 issue (service/repo layer — P3 at this scope)
- Code Quality Review: 2 issues (#5 dynamic SQL footgun, #7 schema max)
- Edge Case Review: 4 meaningful issues (#1 race, #3b partial rollback, #3g empty PATCH, #3e unbounded list)
- Test Review: 1 P1 issue (tests bypass HTTP), 12 coverage gaps
- Performance Review: 2 issues (#3 send loop, #5b create loop)
- Error Handling Review: 1 issue (#6 unwrapped async)
- Security Review: 6 issues ranked P2–P3
- Failure Modes: 5 critical gaps flagged
- **Total findings: 13 ranked, 12 test gaps, 5 critical failure modes**
- Outside voice: skipped (not a git repo, no codex integration available)
- Parallelization: 4 lanes, 3 parallel (A/B/D) + 1 dependent (C)
