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

### What I delegated

- **Full codebase audit against the spec.** Two passes: a requirements-compliance audit (output in `COMPLIANCE_AUDIT.md`) and an engineering-quality review (output in `ENG_REVIEW.md`). This caught wrong HTTP status codes, a missing `sending` status, and a concurrency hole in the send endpoint that I would not have found on a second read.
- **Scaffolding** — initial Express + pg backend, React pages, Redux auth slice, Tailwind components.
- **Sequelize port** — converting the raw-SQL routes to Sequelize models and queries.
- **HTTP-layer test rewrite** — replacing SQL-only tests with supertest integration tests that hit real route handlers.

### Real prompts used

1. *"Perform a thorough business/requirements compliance audit of this codebase against REQUIREMENTS.md v2. Cite file paths and line numbers for every finding. Group gaps by blocker/major/minor. Don't pad with generic advice."*
   — produced the compliance audit.

2. *"Review the as-built implementation as if it were a proposed plan. Focus on what's structurally wrong or fragile in the code that exists today, even where it does meet the spec. Specifically evaluate: double-send race, tests that bypass the HTTP layer, serial await loops in the send route, and whether the PATCH dynamic SQL is safe."*
   — surfaced the concurrency hole, the false-confidence tests, and the pool-exhaustion risk.

3. *"Port the backend from raw pg to Sequelize. Bake in the route fixes (status codes 400→409/422, `sending` intermediate status via atomic compare-and-swap, bulk UPDATE for send) as part of the port so we don't touch the same code twice."*
   — rewrote routes during the ORM migration.

### Where Claude Code was wrong / needed correction

- **Initial scaffolding used `pg` directly**, following REQUIREMENTS.md v1's "no heavy ORMs" clause. REQUIREMENTS.md v2 reversed this and mandated Sequelize. I had to redirect to match the locked stack in CLAUDE.md §3.
- **Initial send endpoint skipped the `sending` intermediate state** — the first draft went straight from draft to sent. That also left a double-send race unaddressed. The eng review caught it; the fix uses an atomic `UPDATE ... WHERE status IN ('draft','scheduled') RETURNING *` as both the CAS gate and the sending-status transition.
- **Status codes** — the first pass used `400` for draft-guard violations. The spec and REST conventions want `409 Conflict` for state-transition failures and `422` for semantic validation (past `scheduled_at`).
- **Tests looked comprehensive but weren't.** The initial test file asserted raw SQL behavior instead of route responses. A test named "prevents deleting a non-draft campaign" asserted a JavaScript boolean and never called the DELETE endpoint. I had this rewritten to hit the HTTP layer with supertest.

### What I would not let Claude Code do

- **Pick the tech stack.** The stack is locked in CLAUDE.md — Sequelize, Vite, Redux Toolkit, Zod. I rejected suggestions to swap in Prisma, Zustand, or SWR for their respective alternatives.
- **Write the auth flow without review.** JWT + bcrypt rounds, `JWT_SECRET` handling, token expiry, 401 middleware — I read every line. The original code had a silent fallback to a hard-coded dev secret, which fails open if the env var is missing in production (that's how secrets leak). Fixed to hard-fail at startup.
- **Decide the async send model.** "Asynchronous" could mean a queue, a worker, or an in-process simulation. The choice changes the architecture. I made the call to keep it in-process for the take-home and documented the tradeoff above.
- **Commit without reading the diff.** Every commit message was written by me after reviewing the changes — no auto-commits, no "trust me" batches.

## Transparency

`COMPLIANCE_AUDIT.md` and `ENG_REVIEW.md` capture the pre-remediation state and the findings that drove this work. Both are committed at the repo root so anyone reading the history can see what was wrong, what was fixed, and what residual risks remain.

## License

MIT (take-home exercise).
