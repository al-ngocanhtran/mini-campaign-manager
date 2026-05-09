# CLAUDE.md — Project Context for AI Agents

> **Read in full before planning or executing any task.** Single source of truth. If anything here conflicts with a user instruction, surface it before proceeding.

---

## 1. Project Overview

**Mini Campaign Manager** — full-stack MarTech tool to create, schedule, send, and track email campaigns.

- Yarn workspaces monorepo (`backend/` + `frontend/`).
- Local setup: one command (`docker compose up`).
---

## 2. Tech Stack (Locked)

Do not swap without explicit approval.

| Layer        | Choice                                                               |
| ------------ | -------------------------------------------------------------------- |
| Backend      | Node.js + Express                                                    |
| Database     | PostgreSQL + Sequelize ORM                                           |
| Auth         | JWT (middleware-based)                                               |
| Validation   | Zod **or** Joi (pick one, stay consistent)                           |
| Migrations   | Sequelize, under `backend/migrations/`, forward-only                 |
| Frontend     | React 18+ + TypeScript, built with Vite                              |
| Server state | React Query **or** SWR                                               |
| Client state | Zustand **or** Redux (justify pick in README)                        |
| Styling      | Tailwind + shadcn/ui (not MUI, not Chakra)                           |
| Monorepo     | Yarn workspaces — `backend/` + `frontend/` at repo root              |

---

## 3. Architecture & Key Directories

### Backend Architecture

```
Request → cors → json → Route → auth → validate → Controller → Service → Model → Postgres
                                                                              ↘ errors → error-handler
```

* Routes: own HTTP shape and mount middleware. 
* Controllers: translate HTTP↔service. 
* Services:  hold business rules and own transactions. 
* Models: Sequelize entities with class-based definitions. 
* `error-handler`: single exit for thrown errors.


### Project Structure

```
mini-campaign-manager/
├── backend/                          # Express + Sequelize API (:3001)
│   ├── src/
│   │   ├── index.ts                  # app entry, route mounting, error handler
│   │   ├── db.ts                     # Sequelize instance
│   │   ├── config/                   # env loading (single source of truth)
│   │   ├── models/                   # User, Campaign, Recipient, CampaignRecipient
│   │   ├── routes/*.routes.ts        # HTTP shape + middleware mounting
│   │   ├── controllers/*.controller.ts  # req → service → res, no status logic
│   │   ├── services/*.service.ts     # business rules + transactions; throws HttpError
│   │   ├── middleware/               # auth, validate(schema, source), error-handler
│   │   ├── errors/http.ts            # HttpError + NotFound/Conflict/Unprocessable/etc.
│   │   └── validation/schemas.ts     # Zod request schemas
│   ├── migrations/*.cjs              # sequelize-cli, forward-only, one table per file
│   ├── seeders/                      # demo user + recipients + bulk sample campaigns
│   ├── config/config.cjs             # sequelize-cli env config
│   ├── eslint.config.js              # flat-config + layer-boundary rule
│   └── tests/                        # Vitest + supertest (auth, campaigns, recipients, rate-limit)
│
├── frontend/                         # React 19 + Vite (:5173)
│   ├── src/
│   │   ├── App.tsx                   # router, providers, query client
│   │   ├── api/client.ts             # only place fetch is called; auto-injects JWT, 401 → logout
│   │   ├── store/                    # Redux Toolkit auth slice (token + user only)
│   │   ├── pages/                    # Login, Campaigns, CampaignNew, CampaignDetail
│   │   ├── components/               # AppHeader, RecipientPicker, StatusBadge, …
│   │   │   └── ui/                   # shadcn primitives (generated, lint-ignored)
│   │   ├── lib/                      # validators, utils, hooks
│   │   └── index.css                 # Tailwind v4 + light/dark token blocks
│   ├── components.json               # shadcn registry config
│   └── vite.config.ts                # dev proxy + HTML-bypass for SPA reloads
│
├── scripts/                          # setup, start, stop, logs, clean, db-reset, test wrappers
├── plans/                            # gap tracker (plans/README.md) + execution plans
├── .claude/                          # project-local Stop hook for plans/README.md
├── .husky/                           # yarn lint && yarn typecheck before push
├── docker-compose.yml                # postgres + backend + frontend
└── package.json                      # yarn workspaces + aggregate lint/typecheck/test
```

---
---

## 4. Database Conventions

- **Parameterized queries only.** Sequelize methods or `sequelize.query(..., { replacements })`. Never interpolate user input.
- **Migrations are forward-only.** One change per numbered file. Never edit a migration that has run — write a new one.
- **Wrap multi-statement writes in a transaction** (`sequelize.transaction(async (t) => ...)`) and pass `{ transaction: t }` to every call inside.
- **Schema rules.** `snake_case` columns/tables, plural table names. Mutable rows have `id`/`created_at`/`updated_at`. FKs enforced at DB level. Timestamps `TIMESTAMPTZ` (UTC).
- **Index intentionally.** Index columns hit in `WHERE`/`ORDER BY`/`JOIN` on hot paths. No speculative indexes.

---

## 5. Data Model

- **User** — `id`, `email` (unique), `name`, `password_hash`, `created_at`
- **Campaign** — `id`, `name`, `subject`, `body`, `status` (`draft`|`sending`|`scheduled`|`sent`), `scheduled_at` (nullable), `created_by` (FK User), `created_at`, `updated_at`
- **Recipient** — `id`, `email` (unique), `name`, `created_at`
- **CampaignRecipient** — `campaign_id`, `recipient_id`, `sent_at` (nullable), `opened_at` (nullable), `status` (`pending`|`sent`|`failed`)

**Required indexes**
- Unique on `users.email`, `recipients.email`
- `campaigns.created_by` (list-by-user)
- `campaigns.status`, `campaigns.scheduled_at` (scheduler scans)
- Composite PK or unique on `(campaign_id, recipient_id)`
- `campaign_recipients.campaign_id` (stats aggregation)

Passwords hashed (bcrypt/argon2). Never plaintext, never returned over the wire.

---

## 6. API Contract (REST)

All `/campaigns` and `/recipients` routes require a valid JWT. Use correct status codes (`400`/`401`/`403`/`404`/`409`/`422`) — no `500` for client errors, no `200` for failures.

**Auth**
- `POST /auth/register` — create user
- `POST /auth/login` — return JWT

**Recipients**
- `GET /recipients` — list
- `POST /recipients` — create

**Campaigns**
- `GET /campaigns` — list (paginated)
- `POST /campaigns` — create (starts `draft`)
- `GET /campaigns/:id` — detail + stats
- `PATCH /campaigns/:id` — update (**only if `draft`**)
- `DELETE /campaigns/:id` — delete (**only if `draft`**)
- `POST /campaigns/:id/schedule` — set `scheduled_at`, transition to `scheduled`
- `POST /campaigns/:id/send` — async send; each recipient marked `sent` or `failed` (randomized)
- `GET /campaigns/:id/stats` — see shape below

**Stats response shape**

```json
{ "total": 0, "sent": 0, "failed": 0, "opened": 0, "open_rate": 0, "send_rate": 0 }
```

- `send_rate = sent / total`
- `open_rate = opened / sent` — return `0` when `sent === 0`

---

## 7. Frontend Requirements

**Pages**
- `/login` — form; JWT in memory or httpOnly cookie (prefer httpOnly; document the pick)
- `/campaigns` — list with status badges, pagination or infinite scroll
- `/campaigns/new` — create form (name, subject, body, recipient emails)
- `/campaigns/:id` — detail: stats, recipient list, action buttons

**UI rules**
- Status badges: `draft`=grey, `scheduled`=blue, `sending`=amber, `sent`=green
- Action buttons conditionally rendered by `status`
- Stats as progress bar or simple chart
- Loading states everywhere (skeletons/spinners) — no blank screens
- Error states everywhere — surface API messages, never raw stack traces
- React Query/SWR cache invalidation after mutations — no page reloads

---

## 8. Testing Requirements

Minimum **3 meaningful tests** — would fail on real regression. Good candidates:

1. Edit/delete blocked once `status !== 'draft'` (`409`)
2. Past `scheduled_at` rejected (`422`)
3. `/stats` rates correct, including `sent === 0` divide-by-zero
4. (Bonus) JWT middleware rejects missing/expired/malformed tokens
5. (Bonus) User A cannot read/modify User B's campaign

Hermetic tests — test DB or rolled-back transactions. Frontend runs on host, not container (container bakes source at build).

---

## 9. How You Operate (Rules + Checklist + Done)

You are a **senior full-stack engineer**, not a code generator.

**Working rules**
- **Plan before coding.** For non-trivial tasks, share a short plan: files touched, data flow, edge cases, failure modes.
- **Read before changing.** Never invent paths, modules, or helpers — open the file.
- **Clarify, don't assume.** One sharp question beats silent rework.
- **Server enforces invariants.** Frontend is convenience, not a security boundary. Business rules must be enforced in the API.
- **Design for failure.** Define unhappy paths for every endpoint and mutation.
- **Separate concerns.** Routes = HTTP. Services = business logic. Models = DB. Validators = inputs. No SQL in routes, no business rules in components.
- **Explicit over clever.** Readable, obvious data flow.
- **Test what matters.** Real bugs — rule violations, auth bypasses, state errors — not return-value smoke tests.
- **Be honest in commits/PRs.** Real work, real mistakes, real corrections.
- **Coding conventions.** Strict TypeScript (no `any`, no unjustified `as`). PascalCase components/types, camelCase functions/vars, kebab-case filenames with load-bearing suffixes (`*.routes.ts`, `*.service.ts`, `*.test.ts`). Comments only when *why* is non-obvious — never narrate *what*.

**Pre-task checklist (run in your head)**
1. Re-read this file if it's been a while.
2. Which sections does this touch?
3. Which §4 conventions apply?
4. Smallest change that satisfies the requirement?
5. What test proves it works?
6. What can break, and how do you handle it?

**Definition of done**
- [ ] Business rules enforced server-side, covered by a test where applicable
- [ ] Endpoints return correct status codes and response shapes
- [ ] Inputs validated with Zod/Joi before reaching services
- [ ] Loading + error states on every screen that fetches
- [ ] `docker compose up` brings up Postgres + backend + frontend cleanly
- [ ] Seed/demo data available
- [ ] README covers setup + architecture choices
- [ ] No secrets or `.env` committed
- [ ] Lint + typecheck clean; relevant tests run for backend changes
