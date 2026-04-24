# Mini Campaign Manager

A simplified MarTech tool for marketers to create, schedule, send, and track email campaigns. Full-stack monorepo — Express + PostgreSQL (Sequelize) backend, React + TypeScript + Vite frontend.


## Quick start

### Prerequisites

- Node.js 20+
- [Yarn](https://yarnpkg.com/) (via corepack: `corepack enable`)
- Docker + Docker Compose

### Run locally

### Option A — full stack in Docker (one command)

```bash
cp .env.example .env
docker compose up -d          # starts postgres + backend + frontend
docker compose exec backend yarn run migrate
docker compose exec backend yarn run seed
# Visit http://localhost:5173
```

### Option B — local Node for faster iteration

```bash
cp .env.example .env
yarn install                  # yarn workspaces hoists to root
docker compose up -d postgres # just the DB
yarn migrate
yarn seed
yarn dev:backend              # http://localhost:3001 (separate terminal)
yarn dev:frontend             # http://localhost:5173 (separate terminal)
```

Log in with: `demo@example.com` / `password123`.

### Run tests

```bash
# Requires a running PostgreSQL on the test DB
createdb campaign_manager_test  # one-time
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/campaign_manager_test yarn test
```

## Architecture

```
mini-campaign-manager/
├── backend/               # Express + Sequelize API (:3001)
│   ├── src/
│   │   ├── index.ts       # App entry, routes mount, global error handler
│   │   ├── db.ts          # Sequelize instance
│   │   ├── models/        # User, Campaign, Recipient, CampaignRecipient
│   │   ├── routes/        # auth, campaigns, recipients
│   │   ├── middleware/    # JWT auth
│   │   └── validation/    # Zod schemas
│   ├── migrations/        # Sequelize-compatible SQL migrations
│   └── tests/             # Vitest + supertest integration tests
├── frontend/              # React 19 + TypeScript + Vite (:5173)
│   └── src/
│       ├── api/client.ts  # Fetch wrapper, types
│       ├── store/         # Redux Toolkit (auth slice)
│       ├── pages/         # Login, Campaigns list, new, detail
│       └── components/    # StatusBadge, StatsDisplay, Spinner, ProtectedRoute
├── docker-compose.yml     # Postgres + (WIP) backend + frontend
└── package.json           # Yarn workspaces root
```

## Key decisions

- **Sequelize over raw `pg` driver.** The original take-home allowed either; the updated spec mandated Sequelize. Models live in `backend/src/models/`; no ORM leakage into route handlers beyond model imports.
- **Redux Toolkit over Zustand.** Token + user live in `auth` slice. Chosen for explicit actions (`setCredentials`, `logout`) that make it easy to wire a global 401 handler. Zustand would have been lighter but adds no clarity at this scope.
- **JWT in Redux in-memory, rehydrated from `localStorage` on app load.** Simpler than httpOnly cookies (no CSRF protection needed) and good enough for a take-home. The tradeoff is XSS exposure — mitigated by `Content-Security-Policy` at a real deployment.
- **Async send is in-process.** `POST /campaigns/:id/send` does an atomic compare-and-swap to `sending`, then issues a single bulk `UPDATE` that randomizes per-recipient `sent`/`failed`/`opened_at`, then transitions to `sent`. For production scale this would move to a queue worker (BullMQ / pg-boss); for the exercise an in-process simulation is honest about the scope.
- **`opened_at` simulated during send.** The spec has no "mark opened" endpoint. Rather than leave open-rate always zero, the bulk update randomly seeds `opened_at` on ~30% of successfully sent recipients.
- **Unknown recipient emails auto-create `Recipient` rows.** Campaign creation upserts by email. Pre-registering recipients via `POST /recipients` is also supported.

## Business rules enforced server-side

- A campaign is editable or deletable only while `status === 'draft'` → `409 Conflict` otherwise.
- `scheduled_at` must be a future timestamp → `422 Unprocessable Entity` otherwise.
- Status transitions: `draft | scheduled → sending → sent`. Send is one-way; once `sent`, no further changes.
- Users can only access their own campaigns (filter on `created_by`); cross-tenant access returns `404` to avoid leaking existence.
- Multi-step writes (create campaign + attach recipients, send) are wrapped in transactions.

## API surface

All `/campaigns` and `/recipients` routes require `Authorization: Bearer <token>`.

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/register` | `{email, name, password}` → `{user, token}` |
| POST | `/auth/login` | `{email, password}` → `{user, token}` |
| GET | `/recipients` | Paginated list |
| POST | `/recipients` | `{email, name}` |
| GET | `/campaigns` | Paginated list for the current user |
| POST | `/campaigns` | `{name, subject, body, recipientEmails}` → campaign (draft) |
| GET | `/campaigns/:id` | Campaign + recipients |
| PATCH | `/campaigns/:id` | 409 if not draft |
| DELETE | `/campaigns/:id` | 409 if not draft |
| POST | `/campaigns/:id/schedule` | `{scheduled_at}`; 409 if not draft, 422 if past |
| POST | `/campaigns/:id/send` | Transitions through `sending` → `sent` with randomized per-recipient outcome |
| GET | `/campaigns/:id/stats` | `{total, sent, failed, opened, open_rate, send_rate}` |

Stats: `send_rate = sent / total`, `open_rate = opened / sent` (returns `0` when `sent === 0`).

## How I Used Claude Code

This repo was built and then remediated in two distinct phases with Claude Code. Phase 1 produced the initial scaffold (Express + raw `pg`, React pages, Redux auth, Tailwind components). Phase 2 — the bulk of what you see now — was a systematic remediation against the spec, driven by two audit artifacts committed at the repo root: `COMPLIANCE_AUDIT.md` (gaps vs. `REQUIREMENTS.md` v2) and `ENG_REVIEW.md` (engineering quality of the as-built code).

### What I delegated

- **A compliance audit** via a dedicated business-analyst agent. Output: a section-by-section report with file+line evidence and a blocker/major/minor action list. This caught wrong HTTP status codes (`400` where `409`/`422` belong), a missing `sending` intermediate status, an empty README, and the absence of the `/recipients` endpoints.
- **An engineering review** via the `plan-eng-review` skill against the as-built code. Output: ranked findings with severity + confidence scores. This is what surfaced the three real correctness risks: a double-send race (no row lock on the status transition), tests that bypassed the HTTP layer entirely (one "prevents deleting" test never called the DELETE endpoint — it asserted a JavaScript boolean), and a serial `await` loop in the send route that holds a pool connection through N round-trips.
- **The Sequelize port** — converting raw `pg` queries to Sequelize models across `db.ts`, `routes/auth.ts`, `routes/campaigns.ts`, `seed.ts`. The route fixes (409/422 status codes, atomic CAS for `sending`, bulk `UPDATE` for send, `opened_at` simulation, `open_rate = opened/sent` formula, defense-in-depth column whitelist on PATCH, `JWT_SECRET` hard-fail, `recipientEmails.max(1000)`) were bundled into the port so the same files weren't rewritten twice.
- **The supertest rewrite** — 20 tests exercising the real Express app, including a concurrency regression test that fires two `POST /send` requests in parallel and asserts exactly one `200` + one `409`.
- **Docker-compose expansion** — Dockerfiles for backend + frontend, postgres healthcheck, wiring so `docker compose up` brings up the full stack.

### Real prompts I used

1. *"Perform a thorough business/requirements compliance audit of this codebase against REQUIREMENTS.md v2. Cite file paths and line numbers for every finding. Group gaps by blocker/major/minor. Do not modify any files — read only."*
   → produced `COMPLIANCE_AUDIT.md`.

2. *"Review the as-built implementation as if it were a proposed plan. Focus on what's structurally wrong or fragile in the code that exists today, even where it does meet the spec. Specifically evaluate: double-send race, tests that bypass the HTTP layer, serial await loops in the send route, PATCH dynamic-SQL construction, JWT secret fallback. Deliver an opinionated review with severity + confidence scores, not a rewrite plan."*
   → produced `ENG_REVIEW.md`. The confidence-score discipline (I only kept findings ≥ 7/10 in the main report) cut noise significantly.

3. *"Port the backend from raw pg to Sequelize. Bake in the route fixes (status codes 400 → 409/422, `sending` intermediate status via atomic compare-and-swap, bulk UPDATE for send with random delivery/open) as part of the port so we do not touch the same files twice. Keep the SQL migration format; use Sequelize for queries. Verify by type-check + smoke curl against a live postgres."*
   → produced the `452105c` commit.

### Where Claude Code was wrong / needed correction

- **First scaffold used `pg` directly** because REQUIREMENTS.md v1 explicitly said "no heavy ORMs." REQUIREMENTS.md v2 reversed that and mandated Sequelize. The v2 requirement wasn't caught until the compliance audit ran — that's on me for not re-reading the spec before building. Phase 2 had to port the entire data layer.
- **The first Sequelize port used `DataTypes.ENUM` for `status` columns**, which conflicts with the existing `VARCHAR(20) + CHECK` migration and would have required a destructive schema rewrite. I changed it to `DataTypes.STRING(20)` with `validate.isIn` — keeps the migration stable and preserves the CHECK constraint as the source of truth.
- **Yarn 4 default (PnP) broke TypeScript resolution** across every file in the backend (`Cannot find module 'express'`, `Property 'findOne' does not exist on type 'typeof Campaign'`, etc.). Claude initially just tried to push through. Once I identified the symptom, switching `.yarnrc.yml` to `nodeLinker: node-modules` fixed it in one shot.
- **First status-code pass returned `400` for draft-guard violations** and for past `scheduled_at`. That's a REST misuse: `409 Conflict` is the right code for state-transition failures; `422 Unprocessable Entity` is the right code for a syntactically valid payload that fails a semantic check. Fixed after the compliance audit flagged it.
- **First test suite was false confidence.** Five tests that all ran raw SQL and asserted JavaScript booleans. They passed, and they would have passed if every route returned `500`. I rewrote them to use supertest against the real Express app, with the concurrent-send race as an explicit regression test for the atomic CAS fix.
- **Initial README was aspirational** — it described the end state as if already true while the code was mid-port. I added a visible `⚠ Status: remediation in progress` banner and removed it only after every blocker closed (`cdd628d`). Future me would write the banner *first* next time.

### What I would not let Claude Code do

- **Pick the tech stack.** It's locked in `CLAUDE.md §3` — Sequelize, Vite, Redux Toolkit, Zod, Tailwind. I rejected drift toward Prisma, Zustand, and SWR even when they would have been marginally simpler.
- **Ship the auth flow unreviewed.** `JWT_SECRET` had a silent fallback to a dev string — that's how secrets leak when someone forgets the env var in production. Replaced with a hard-fail at startup in production, plus a visible `console.warn` in non-prod. bcrypt rounds bumped from 10 to 12 (OWASP current); password minimum from 6 to 8 characters.
- **Skip the concurrency regression test.** It would have been easy to fix the double-send race "in code" and move on. A race that's only accidentally absent from the next refactor is still a race. The test at `backend/tests/campaigns.test.ts` fires two parallel sends and asserts the outcome is `[200, 409]` sorted — never `[200, 200]`.
- **Decide the async-send architecture.** "Asynchronous send" could mean a queue worker, a BullMQ job, or a simulated in-process transition. The choice changes the operational story. I made the explicit call to keep it in-process for the exercise and documented how it would scale to a real queue.
- **Auto-commit batches.** Every one of the seven commits in `git log` has a hand-written message and an atomic scope. Claude's suggested messages went through review before landing.
- **Run destructive operations without confirmation.** Moving from npm lock files to yarn workspaces required deleting the two `package-lock.json` files. That went through `git rm` + an explicit commit message rather than a silent blanket delete.

## Transparency

`COMPLIANCE_AUDIT.md` and `ENG_REVIEW.md` capture the pre-remediation state and the findings that drove this work. Both are committed at the repo root so anyone reading the history can see what was wrong, what was fixed, and what residual risks remain.

## License

MIT (take-home exercise).
