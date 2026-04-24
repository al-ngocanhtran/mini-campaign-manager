# Compliance Audit — Mini Campaign Manager

**Audit date:** 2026-04-24
**Audited against:**
- `REQUIREMENTS.md` v2 (authoritative version starting at line 129)
- `CLAUDE.md` (project constitution)

---

## Executive Summary

The implementation is **partially compliant**. The core product works and most business rules are correctly enforced server-side, but it deviates from the locked tech stack on three points that are explicit blockers per `CLAUDE.md §3`: the raw `pg` driver is used instead of **Sequelize**, there is no **yarn workspaces** monorepo root, and `docker-compose.yml` only starts Postgres (not backend + frontend). Additional gaps: the `sending` campaign status is missing end-to-end (DB CHECK constraint, route logic, frontend types), the `/recipients` GET/POST endpoints are absent entirely, the `README.md` is empty (no setup, no "How I Used Claude Code" section), HTTP status codes on draft-guard violations are `400` instead of `409`, and the current tests bypass the HTTP layer so they provide little regression safety.

**Top 3 blockers:**
1. Backend does not use Sequelize (uses `pg` driver directly).
2. No yarn workspaces root — `backend/` and `frontend/` are flat siblings.
3. `/recipients` endpoints missing + `README.md` empty (both required deliverables).

---

## Section-by-Section Compliance

### 1. Repo structure & monorepo

| Item | Status | Evidence |
|---|---|---|
| Yarn workspaces root | ❌ Missing | No `package.json` at `mini-campaign-manager/` root. No `packages/` layout. |
| Monorepo layout | 🟡 Deviates | `backend/` and `frontend/` are flat siblings, not workspace packages. |
| Docker Compose brings up full stack | ⚠️ Partial | `docker-compose.yml:1-13` starts Postgres only; no backend/frontend services or Dockerfiles. |
| `.env.example` committed | ✅ | Present at `mini-campaign-manager/.env.example`. |

### 2. Tech stack

| Item | Locked value | Actual | Status |
|---|---|---|---|
| ORM | Sequelize | `pg` driver with raw SQL | ❌ Blocker |
| Backend framework | Express | Express 4.21.0 | ✅ |
| Frontend build | Vite | Vite 8.0.9 | ✅ |
| React | 18+ | React 19.2.5 | ✅ |
| Server state | React Query or SWR | `@tanstack/react-query` 5.99.2 | ✅ |
| Client state | Zustand or Redux | `@reduxjs/toolkit` 2.11.2 | ✅ |
| Validation | Zod or Joi | Zod 3.23.8 | ✅ |
| Styling | Any (Tailwind OK) | Tailwind 4.2.3 | ✅ |
| Testing | — | Vitest 2.1.0 | ✅ |
| TypeScript strict | Required | `backend/tsconfig.json:8` `"strict": true` | ✅ |

Evidence: `backend/package.json:18` `"pg": "^8.13.0"` — no `sequelize` dependency anywhere.

### 3. Schema / data model

| Item | Status | Evidence |
|---|---|---|
| `users` table (id, email, name, password_hash, created_at) | ✅ | `migrations/001_initial.sql:4-10` |
| `campaigns` table columns | ✅ | `migrations/001_initial.sql:12-22` |
| `campaigns.status` includes `sending` | ❌ Major | `001_initial.sql:17` — CHECK only allows `draft`, `scheduled`, `sent`. |
| `recipients` table | ✅ | `001_initial.sql:24-29` |
| `campaign_recipients` table | ✅ | `001_initial.sql:31-38` composite PK on `(campaign_id, recipient_id)` |
| Indexes (created_by, status, scheduled_at, CR.campaign_id, recipients.email) | ✅ | `001_initial.sql:41-58` |
| Password hashed (never plaintext) | ✅ | `routes/auth.ts:22` bcrypt round 10; no hash returned over the wire |

### 4. API endpoints

| Endpoint | Status | Evidence / Gap |
|---|---|---|
| `POST /auth/register` | ✅ | `routes/auth.ts:9-31` — 400/409/201 |
| `POST /auth/login` | ✅ | `routes/auth.ts:34-54` — 400/401/200 |
| `GET /recipients` | ❌ Blocker | Not implemented. No route file, not mounted. |
| `POST /recipients` | ❌ Blocker | Not implemented. Frontend `vite.config.ts` proxy also lacks `/recipients`. |
| `GET /campaigns` | ✅ | `routes/campaigns.ts:16-40` — paginated, tenant-scoped |
| `POST /campaigns` | ✅ | `campaigns.ts:43-106` — Zod + transaction wrapping insert + upsert + attach |
| `GET /campaigns/:id` | ✅ | `campaigns.ts:109-133` |
| `PATCH /campaigns/:id` | ⚠️ Partial | `campaigns.ts:154` returns **400**, should be **409** |
| `DELETE /campaigns/:id` | ⚠️ Partial | `campaigns.ts:201` returns **400**, should be **409** |
| `POST /campaigns/:id/schedule` | ⚠️ Partial | `campaigns.ts:227` returns **400** on non-draft, should be **409**. Past timestamp returns **400** via Zod, should be **422**. |
| `POST /campaigns/:id/send` | ⚠️ Partial | `campaigns.ts:255` returns **400** when already sent, should be **409**. Skips `sending` intermediate status. `opened_at` never simulated. |
| `GET /campaigns/:id/stats` | ⚠️ Partial | `campaigns.ts:333` — `open_rate` divides by `total`, spec says divide by `sent` |

### 5. Business rules (server-side)

| Rule | Status | Evidence / Gap |
|---|---|---|
| Edit/delete only when draft → **409 Conflict** | ❌ Major | All three routes return 400 (lines 154, 201, 227) |
| `scheduled_at` must be future → **422** | ❌ Minor | Returns 400 via generic Zod handler |
| One-way send (once `sent`, stays `sent`) | ✅ | `campaigns.ts:254` blocks re-send |
| Transition includes `sending` state | ❌ Major | Send route goes draft→sent directly; `sending` never set |
| Tenant isolation (`created_by === user.id`), 404 on miss | ✅ | Every query filters by `created_by`; returns 404 (not 403) |
| Transactions on multi-step writes | ✅ | Campaign create (50-105) and send (258-295) wrapped in BEGIN/COMMIT/ROLLBACK |
| Zod validation before service layer | ✅ | All mutation routes use `safeParse()` |
| Async send with random sent/failed | ⚠️ Partial | Random failure implemented (`campaigns.ts:271`, ~10%); loop is `await`-serial, not truly async. No documentation of choice. |

### 6. Campaign statuses (`sending` missing end-to-end)

| Layer | Status | Evidence |
|---|---|---|
| DB CHECK constraint | ❌ | `001_initial.sql:17` — `sending` absent |
| Send route sets `sending` before `sent` | ❌ | `campaigns.ts:266-290` — skips straight to `sent` |
| Frontend `Campaign` type | ❌ | `frontend/src/api/client.ts:87` — only `"draft" \| "scheduled" \| "sent"` |
| `StatusBadge` handles `sending` | ❌ | `StatusBadge.tsx:1-5` — no `sending` case; TS would reject it as a prop value |

### 7. Frontend pages & UX

| Item | Status | Evidence |
|---|---|---|
| `/login` with in-memory JWT | ✅ | `pages/Login.tsx` — Redux store, error+loading states |
| `/campaigns` list with pagination + badges | ✅ | `pages/Campaigns.tsx:71-91` pagination, StatusBadge on rows |
| `/campaigns/new` with email list | ✅ | `pages/CampaignNew.tsx` — comma/newline parsing, error+loading |
| `/campaigns/:id` detail with stats + actions | ✅ (minor gap) | `CampaignDetail.tsx` — actions gated by status. No distinct error branch for initial fetch failure (line 56 collapses 404+network error to "Campaign not found") |
| Status badge colors (grey/blue/green) | ✅ | `StatusBadge.tsx` |
| Status badge `sending` = amber | ❌ | Missing |
| Action buttons conditional | ✅ | `CampaignDetail.tsx:104,114,132` |
| Stats display (progress bar / chart) | ✅ | `StatsDisplay.tsx` — 4-column counts + two progress bars |
| Loading states | ✅ | Spinners + button disabled states everywhere |
| Error states | ✅ | Red error divs surface API messages; no raw stacks |
| React Query invalidation on mutations | ✅ | `invalidateQueries` called after every mutation |
| `/recipients` proxy entry in Vite | ❌ | `vite.config.ts:9-12` — only `/auth`, `/campaigns`, `/health` proxied |

### 8. Testing

| Item | Status | Evidence |
|---|---|---|
| ≥ 3 meaningful tests for business logic | ⚠️ Quantity ✅, quality partial | `tests/campaigns.test.ts` has 5 tests across 3 describes |
| Tests exercise HTTP layer | ❌ Major | All tests go directly to SQL; never assert route status codes. Test at lines 114-126 ("prevents deleting") never calls the DELETE route — it asserts a JS boolean `canDelete === false`. |
| Covers: edit/delete non-draft returns 409 | ❌ | Would pass even if route returned 500 |
| Covers: past `scheduled_at` returns 422 | ❌ | No test |
| Covers: stats divide-by-zero | ✅ | Stats test (line 163) validates aggregation math |
| Covers: JWT middleware rejects missing/expired | ❌ | No test |
| Covers: cross-tenant isolation | ❌ | No test |
| Hermetic test isolation | ✅ | Separate test DB; `beforeEach` cleans tables; `afterAll` cleans users |

### 9. README / docs

| Item | Status | Evidence |
|---|---|---|
| `README.md` present | ⚠️ | File exists but **0 lines** (`wc -l README.md`) |
| Local setup (`docker compose up`) | ❌ | Missing |
| Seed data / demo script docs | ❌ | `npm run seed` exists but not documented |
| "How I Used Claude Code" section | ❌ Blocker | Required by REQUIREMENTS.md Part 3 + CLAUDE.md §10 |
| Architecture decisions documented (ORM, JWT storage, async send) | ❌ | None documented |

### 10. Definition of Done (CLAUDE.md §12)

| Item | Status |
|---|---|
| Business rules enforced server-side and tested | ⚠️ Enforced but wrong status codes; tests skip HTTP layer |
| Correct status codes + response shapes | ⚠️ 400→should-be-409 in 4 places; 400→should-be-422 in 1 place |
| Zod/Joi validation before services | ✅ |
| Loading + error states on every fetch screen | ✅ |
| `docker compose up` → Postgres + backend + frontend | ❌ Postgres only |
| Seed script / demo data | ✅ (`npm run seed`, `demo@example.com / password123`) |
| README: setup + architecture + "How I Used Claude Code" | ❌ Empty |
| No secrets / `.env` committed | ✅ |
| Linter + type-checker clean | ⚠️ Not verified; would fail if code attempted `sending` status given current `Campaign` type |

---

## Prioritized Action List

### Blockers (must fix to meet stated requirements)

1. **Port backend to Sequelize.** Replace raw `pg` + SQL with Sequelize models and Sequelize migrations. `backend/package.json`, `backend/src/db.ts`, all routes, `migrations/`. Required by `REQUIREMENTS.md v2 §4` and `CLAUDE.md §3`.
2. **Create yarn workspaces root.** Add `mini-campaign-manager/package.json` with `"workspaces": ["backend", "frontend"]`. Required by `REQUIREMENTS.md:194` and `CLAUDE.md §3`.
3. **Add `/recipients` GET + POST routes.** New `backend/src/routes/recipients.ts`, mount in `index.ts`, add Vite proxy entry in `frontend/vite.config.ts`.
4. **Write README.** Setup steps, architecture decisions (ORM choice, JWT storage, async send approach, state library), and the mandatory "How I Used Claude Code" section with real prompts, corrections, and non-delegated decisions.
5. **Add backend + frontend services to `docker-compose.yml`.** Dockerfiles for each package; wire so `docker compose up` is one-command start.

### Major (non-blocker, breaks stated spec)

6. **Add `sending` status end-to-end.**
   - `migrations/001_initial.sql:17` — include `'sending'` in CHECK
   - `campaigns.ts` send route — set status to `sending` before processing, then `sent` after
   - `frontend/src/api/client.ts:87` — extend `Campaign.status` union
   - `StatusBadge.tsx` — amber branch for `sending`
   - `CampaignDetail.tsx` — update conditional logic for action buttons
7. **Fix draft-guard HTTP status codes.** `campaigns.ts:154, 201, 227, 255` — change `400` → `409`.
8. **Fix `scheduled_at` past-timestamp response code.** Return `422` (pre-check `scheduled_at > now()` and respond 422, or branch on Zod issue). Currently returns `400` via generic Zod handler.
9. **Fix `open_rate` formula.** `campaigns.ts:333` — change `opened / total` to `opened / sent`; guard on `sent === 0` (not `total === 0`).
10. **Move tests to HTTP layer.** Use `supertest` to assert actual route responses. Rewrite the "prevents deleting" test (lines 114-126) to call the DELETE endpoint and assert `409`. Add tests for 422 on past `scheduled_at` and JWT middleware rejection.

### Minor

11. **Simulate `opened_at` during send.** Randomly seed `opened_at` for ~30-50% of `sent` recipients; document in README.
12. **Distinct error state on `CampaignDetail` initial fetch.** Use `isError` from `useQuery` to separate 404 from network error.
13. **Document JWT-in-Redux storage choice** in README (tradeoff vs. httpOnly cookie per CLAUDE.md §11).
14. **Verify linter + type-checker clean** once `sending` status is added across the type surface.
