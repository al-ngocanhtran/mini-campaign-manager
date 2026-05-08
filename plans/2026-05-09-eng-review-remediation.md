# 2026-05-09 — ENG_REVIEW remediation (tight scope)

**Source:** `ENG_REVIEW.md` (2026-04-24)
**Cross-ref:** `plan/README.md` (canonical gap tracker — IDs noted per item)
**Scope:** "Tight: outstanding + partials + nits" — closes what's still open after five commits of follow-up work. Service/repo extraction is explicitly out (review itself recommended deferring at this scope).

## Context

Most of `ENG_REVIEW.md` was addressed by the Sequelize port, the supertest rewrite, and the frontend rehydration commit. This plan closes the residue. It overlaps with several stable IDs in `plan/README.md` — when an item lands, flip the `[ ]` there too.

## Status of original review findings

| # | Finding | Status | Evidence | plan/README ID |
|---|---|---|---|---|
| 1 | Double-send race | **FIXED** | `routes/campaigns.ts:229-235` atomic CAS | — |
| 2 | Tests bypass HTTP | **FIXED** | `tests/campaigns.test.ts` supertest end-to-end | — |
| 3 | Serial send loop | **FIXED** | `routes/campaigns.ts:249-263` bulk CTE UPDATE | — |
| 4 | JWT_SECRET fallback | **PARTIAL** | `middleware/auth.ts:6-13` only fails on `NODE_ENV==='production'` | `SEC-003`, `SEC-004`, `INF-004` |
| 5 | PATCH dynamic SQL | **FIXED** | `routes/campaigns.ts:132-136` whitelist | — |
| 6 | Async handlers unwrapped | **FIXED** | `index.ts:1` `express-async-errors` | — |
| 7 | `recipientEmails` no `.max()` | **FIXED** | `schemas.ts:62,70` `.max(1000)` | — |
| 8 | JWT lost on refresh | **FIXED** | `authSlice.ts:11-22` localStorage rehydrate | — |
| 9 | No 401 interceptor | **FIXED** | `api/client.ts:29-31` dispatches `logout()` | — |
| 10 | Auth rate limiting | **OUTSTANDING** | no `express-rate-limit` in deps | `SEC-002` |
| 11 | bcrypt rounds=10 | **FIXED** | `routes/auth.ts:9` rounds=12 | — |
| 12 | Password min=6 | **FIXED** | `schemas.ts:41` min=12 + common-password blocklist | — |
| 13 | Service/repo layer | **DEFERRED** | review-recommended | — |
| 3b | Partial-send rollback semantic undocumented | **OUTSTANDING** | needs README line | — |
| 3d | `scheduled_at` timezone landmine | **OUTSTANDING** | `schemas.ts:82` accepts naive ISO; frontend `<input type="datetime-local">` submits naive local | — |
| 3g | Empty PATCH no-ops | **FIXED** | `schemas.ts:72-79` `.refine()` returns 400 | — |
| 6c | Error response shape inconsistency | **OUTSTANDING** | auth uses `{error, fields}`, campaigns use `{error, details}` | — |

**Net work: 6 items + 1 test gap (concurrent-send regression).**

---

## Items to ship

### 1. Rate-limit `/auth/login` and `/auth/register` *(closes review #10, plan/README `SEC-002`)*

Add `express-rate-limit`, mount on the auth router only. Campaign routes are already JWT-gated; bcrypt-thread-pool DoS is the abuse pattern that matters here.

**Files:**
- `backend/package.json` — add `express-rate-limit`.
- `backend/src/routes/auth.ts` — mount limiter on `/login` and `/register`.
- `backend/src/index.ts` — `app.set('trust proxy', 1)` for when this runs behind a reverse proxy.

**Shape:**
```ts
// routes/auth.ts
import rateLimit from "express-rate-limit";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts, try again later" },
});

router.post("/register", authLimiter, async (req, res) => { ... });
router.post("/login",    authLimiter, async (req, res) => { ... });
```

**Test:** `backend/tests/auth-rate-limit.test.ts` (new, isolated app instance — limiter is in-memory and would leak across `describe` blocks otherwise):
```ts
it("returns 429 after 10 rapid login attempts from same IP", async () => {
  for (let i = 0; i < 10; i++) {
    await request(app).post("/auth/login").send({ email: "x@y.com", password: "wrong" });
  }
  const res = await request(app).post("/auth/login").send({ email: "x@y.com", password: "wrong" });
  expect(res.status).toBe(429);
});
```

---

### 2. Harden JWT_SECRET enforcement *(closes review #4 partial, plan/README `SEC-003` + `SEC-004` + `INF-004`)*

Current code allows the dev fallback whenever `NODE_ENV !== 'production'`. Failure mode: any environment that forgets to set `NODE_ENV` (staging, preview deploy, container without env) silently signs with a known string. Compose currently hard-codes `NODE_ENV: development`, so the production guard never fires regardless of where compose runs (per `SEC-004`).

**File:** `backend/src/middleware/auth.ts`

**Change:** allow-list dev/test instead of deny-list production. Drop the in-code fallback.

```ts
const JWT_SECRET = process.env.JWT_SECRET;
const ENV = process.env.NODE_ENV;

if (!JWT_SECRET) {
  if (ENV === "development" || ENV === "test") {
    console.warn("JWT_SECRET not set — using insecure dev fallback. Never deploy this way.");
  } else {
    throw new Error(`JWT_SECRET must be set (NODE_ENV=${ENV ?? "unset"})`);
  }
}

const secret = JWT_SECRET || "dev-secret-not-for-production";
```

**Compose:** in `docker-compose.yml`, change `JWT_SECRET: ${JWT_SECRET:-dev-secret-change-in-production}` → `JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required}` so compose itself aborts on unset host env. (This is the `SEC-003` fix; doing it together because the in-code change is meaningless without the compose change.)

The test bootstrap already sets both `JWT_SECRET` and `NODE_ENV=test` before importing the app (`tests/campaigns.test.ts:9-13`), so the suite stays green. No new test — fail-fast at module-load time would need a child-process spawn to cover, not worth it at this scope. Add a one-line comment in `auth.ts` noting the contract.

---

### 3. `scheduled_at` timezone safety *(closes review #3d)*

Two-pronged fix because both ends are wrong.

**Backend** — `backend/src/validation/schemas.ts:81-86`. Reject ISO strings without an explicit offset. PostgreSQL stores `timestamp with time zone`; refusing naive strings prevents server-locale-dependent interpretation.

```ts
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export const scheduleCampaignSchema = z.object({
  scheduled_at: z
    .string()
    .regex(ISO_WITH_OFFSET, {
      message: "scheduled_at must be an ISO 8601 timestamp with explicit timezone offset (e.g. 2026-05-09T10:00:00Z)",
    })
    .refine((val) => !isNaN(new Date(val).getTime()), {
      message: "scheduled_at must be a valid ISO timestamp",
    }),
});
```

**Frontend** — schedule form (`frontend/src/pages/CampaignDetail.tsx`). The `<input type="datetime-local">` value is `"2026-05-09T10:00"` (local, no offset). Convert before submit:

```ts
const iso = new Date(local).toISOString();   // → "2026-05-09T01:00:00.000Z"
mutate({ scheduled_at: iso });
```

**Test** — add to existing `POST /campaigns/:id/schedule` describe block:
```ts
it("returns 400 when scheduled_at lacks a timezone offset", async () => {
  const id = await createCampaignWith("draft");
  const res = await request(app)
    .post(`/campaigns/${id}/schedule`)
    .set("Authorization", `Bearer ${userAToken}`)
    .send({ scheduled_at: "2027-01-01T10:00:00" });   // no Z, no offset
  expect(res.status).toBe(400);
});
```

---

### 4. Error response shape consistency *(closes review #6c)*

Three shapes coexist today:
- `auth.ts` validation errors: `{error, fields: {field: msg}}`
- `campaigns.ts` validation errors: `{error, details: zodFlatten}`
- Other 4xx: `{error}` only

Pick one — the auth shape (`fields`). Flatter, easier for the frontend to render inline per-field, and `Login.tsx` already consumes it.

**Files:**
- `backend/src/validation/errors.ts` — **new**, exports `fieldErrors(err: ZodError)` (move from `routes/auth.ts:11-18`).
- `backend/src/routes/auth.ts` — import the helper instead of defining it locally.
- `backend/src/routes/campaigns.ts` lines 45, 117, 197 — replace `details: parsed.error.flatten()` with `fields: fieldErrors(parsed.error)`.
- `backend/tests/campaigns.test.ts` — any assertion against `body.details` becomes `body.fields`. (Search: `grep -rn "\.details" backend/tests/`.)
- `frontend/src/api/client.ts` and any consumer of `details` — verify with grep; switch to `fields`. If only `Login.tsx` reads validation errors today, no other frontend changes needed.

---

### 5. Concurrency regression test for atomic-CAS gate *(§4 test gap)*

The atomic CAS at `routes/campaigns.ts:229-235` has no test today. Two parallel `POST /send` should produce exactly one 200 and one 409.

**File:** `backend/tests/campaigns.test.ts` — add to `POST /campaigns/:id/send` describe block.

```ts
it("returns 200 once and 409 once when two sends fire concurrently", async () => {
  const id = await createCampaignWith("draft");
  const [a, b] = await Promise.all([
    request(app).post(`/campaigns/${id}/send`).set("Authorization", `Bearer ${userAToken}`),
    request(app).post(`/campaigns/${id}/send`).set("Authorization", `Bearer ${userAToken}`),
  ]);
  const statuses = [a.status, b.status].sort();
  expect(statuses).toEqual([200, 409]);

  const after = await Campaign.findByPk(id);
  expect(after?.status).toBe("sent");
});
```

The test asserts the *set* of outcomes, not which request "won" — that's the right invariant. If it ever flakes locally, fan out to 5 parallel sends and assert exactly one 200 with the rest 409.

---

### 6. README note on partial-send atomicity *(closes review #3b)*

Single paragraph in `README.md` design-decisions section:

> **Send is all-or-nothing by design.** The send pipeline runs every recipient update inside a single transaction; if any fails, the whole campaign rolls back to its prior state. This is correct for the demo because the "delivery" is simulated — there is no real provider that already accepted the email. For a production integration with SES/SendGrid/etc., this would need to change to per-recipient commits or an outbox-pattern worker, because real emails actually leaving the building cannot be rolled back.

No code changes.

---

## ASCII overview

```
LANE A — backend correctness/auth                 LANE B — schema + tests + frontend
┌───────────────────────────────────┐             ┌───────────────────────────────────────┐
│ 1. add express-rate-limit        │             │ 3a. tighten scheduleCampaignSchema    │
│    + trust proxy                 │             │     (regex offset required)           │
│ 2. JWT_SECRET fail-fast unless   │             │ 3b. frontend datetime-local → UTC ISO │
│    NODE_ENV=development|test     │             │ 4.  unify validation error shape      │
│    + compose JWT_SECRET:?        │             │     (extract fieldErrors helper)      │
│ 4 (server side). swap details →  │             │ 5.  concurrency regression test       │
│    fields, share fieldErrors     │             │ 6.  README atomicity paragraph        │
└───────────────────────────────────┘             └───────────────────────────────────────┘
```

Lane A: `auth.ts` + `middleware/auth.ts` + `index.ts` + `docker-compose.yml`. Lane B: `schemas.ts` + `routes/campaigns.ts` (only error-shape lines) + `tests/` + frontend + README. Conflict surface is `routes/campaigns.ts` validation error lines — keep them in lane B.

## Files modified

- `backend/package.json` — add `express-rate-limit`.
- `backend/src/index.ts` — `app.set('trust proxy', 1)`.
- `backend/src/middleware/auth.ts` — JWT_SECRET fail-fast.
- `backend/src/routes/auth.ts` — mount `authLimiter`; import `fieldErrors`.
- `backend/src/routes/campaigns.ts` — replace 3× `details: ...flatten()` with `fields: fieldErrors(...)`.
- `backend/src/validation/schemas.ts` — `ISO_WITH_OFFSET` regex on `scheduleCampaignSchema`.
- `backend/src/validation/errors.ts` — **new**, exports `fieldErrors(err: ZodError)`.
- `backend/tests/campaigns.test.ts` — concurrent-send test, timezone test, error-shape assertion swaps.
- `backend/tests/auth-rate-limit.test.ts` — **new**, isolated app instance.
- `frontend/src/pages/CampaignDetail.tsx` — UTC ISO conversion before mutate.
- `docker-compose.yml` — `JWT_SECRET:?` instead of fallback default.
- `README.md` — partial-send atomicity paragraph.

## What already exists (reused, not rebuilt)

- `fieldErrors` helper in `routes/auth.ts:11-18` — extracted to shared module for #4.
- supertest test scaffolding in `tests/campaigns.test.ts` — concurrency + timezone tests slot in.
- Atomic CAS gate in `routes/campaigns.ts:229-235` — already correct; new test just covers it.
- `express-async-errors` already in `index.ts:1` — no error-middleware changes needed.

## NOT in scope

- **Service/repo extraction (review #13).** Review explicitly recommended deferring at this scope; tenant filter is consistent across the seven `where: { ..., created_by: req.user!.id }` sites.
- **Partial-send → per-recipient commits (#3b).** README documentation only — production redesign is a separate effort.
- **Rate limiting on campaign routes.** Already JWT-gated; abuse pattern is different. Defer unless evidence appears.
- **Error logging upgrade (review #6b, plan/README `SEC-008`).** Out of this lane; tracked separately.
- **React Query cache key shape change.** `Campaigns.tsx:35` already uses `["campaigns", page]`; broad invalidation is acceptable.
- **bcrypt rounds tuning beyond 12.** At OWASP-current value.

## Verification

End-to-end:
1. `cd backend && yarn install` (picks up `express-rate-limit`).
2. `cd backend && yarn test` — existing tests + concurrency test + timezone test + rate-limit test pass.
3. `docker compose up` from repo root.
4. Manual smoke:
   - Login form: still works after refresh (JWT rehydration regression check).
   - Schedule a campaign with the picker: payload sent with `Z` suffix; campaign scheduled correctly across server timezones (set backend container `TZ=UTC` then `TZ=Asia/Tokyo`, confirm stored `scheduled_at` is identical).
   - Hit `/auth/login` 11 times with curl: 11th returns `429` with the expected JSON body.
   - Stop backend, unset `JWT_SECRET` from host env, run `docker compose up`: compose itself aborts before container starts.
5. `cd frontend && yarn lint && yarn tsc --noEmit`.
6. `cd backend && yarn lint && yarn tsc --noEmit`.

## Sequencing

Single PR is fine — ~10 files, all related. Suggested commit order if splitting:

1. `chore: extract fieldErrors helper to validation/errors.ts` (no behavior change)
2. `refactor: unify validation error response shape` (campaigns now match auth)
3. `feat(auth): rate-limit register/login + trust proxy` *(closes SEC-002)*
4. `feat(auth): require JWT_SECRET except in dev/test + compose-level guard` *(closes SEC-003 + SEC-004 / INF-004)*
5. `feat(schedule): require explicit timezone on scheduled_at`
6. `test: add concurrent-send regression for atomic CAS`
7. `docs(readme): document partial-send atomicity`

Each commit builds and passes tests on its own.

When commits 3 and 4 land, flip the `[ ]` boxes for `SEC-002`, `SEC-003`, `SEC-004`, and `INF-004` in `plan/README.md`.
