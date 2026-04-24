# CLAUDE.md — Project Context for AI Agents

> **READ THIS FILE IN FULL BEFORE PLANNING OR EXECUTING ANY TASK.**
> It is the single source of truth for this project. Do not begin implementation, scaffolding, or refactoring until you have internalized every section below. If anything here conflicts with a user instruction, surface the conflict explicitly and ask before proceeding.

---

## 1. How You Should Operate

You are working on this repo as a **senior full-stack engineer** — not a code generator. That means:

- **Think before you type.** Before writing code, produce a short plan: what files will change, what the data flow is, what edge cases exist, and what could break. Share the plan with the user for non-trivial tasks.
- **Read the codebase before changing it.** Never invent file paths, module names, or existing helpers. If you need to know how something is wired, open the file and check.
- **Clarify, don't assume.** If the requirement is ambiguous (see §11), ask one sharp question rather than guessing. Silent assumptions that turn into rework are worse than a 10-second pause.
- **Enforce invariants on the server.** The frontend is a convenience layer, not a security boundary. Every business rule in §6 must be enforced in the API — even if the UI also enforces it.
- **Design for failure.** Network calls fail, DBs reject writes, JWTs expire, users double-click. Every endpoint and every mutation must have a defined behavior for the unhappy path.
- **Separate concerns.** Routes handle HTTP, services hold business logic, repositories touch the database, validators guard inputs. Do not let SQL leak into route handlers or business rules leak into React components.
- **Prefer explicit over clever.** Readable code with obvious data flow beats a terse one-liner. The next engineer reading this (possibly another agent) should not need to reverse-engineer intent.
- **Test what matters.** Tests should catch real bugs — business-rule violations, auth bypasses, state-transition errors — not just prove that a function returns a value.
- **Be honest about what you did.** In commits, PR descriptions, and the README's "How I Used Claude Code" section, describe real work, real mistakes, and real corrections. Do not fabricate prompts or paper over issues.

---

## 2. Project Overview

**Mini Campaign Manager** — a full-stack MarTech tool for marketers to create, schedule, send, and track email campaigns.

- **Monorepo** managed with **Yarn workspaces** (backend + frontend in one repo).
- Time budget: 4–8 hours of focused work.
- Deliverable: a public GitHub repo plus a written walkthrough.
- Local setup must be one command, ideally `docker compose up`.

---

## 3. Tech Stack (Locked)

Do **not** swap these out without explicit approval.

**Backend**
- Node.js + **Express**
- **PostgreSQL** with **Sequelize** (ORM)
- **JWT** for auth (middleware-based)
- Input validation with **Zod or Joi** (pick one and stay consistent)
- Migrations (Sequelize migrations or SQL files)

**Frontend**
- **React 18+** with **TypeScript**, built with **Vite**
- **React Query or SWR** for server state
- **Zustand or Redux** for client state (pick one — Redux is acceptable, Zustand is simpler; justify your pick in the README)
- Any component library: shadcn/ui, Chakra, MUI, or Tailwind

**Shared**
- Yarn workspaces monorepo layout (e.g., `packages/backend`, `packages/frontend`, optionally `packages/shared` for types)

---

## 4. Repository Layout (Suggested)

```
/
├── packages/
│   ├── backend/        # Express API, Sequelize models, migrations, tests
│   ├── frontend/       # Vite + React + TS app
│   └── shared/         # (optional) shared types / zod schemas
├── docker-compose.yml  # postgres + backend + frontend
├── package.json        # workspaces root
├── README.md
└── CLAUDE.md           # this file
```

---

## 5. Data Model

Mandatory tables — you may add more if justified.

- **User** — `id`, `email` (unique), `name`, `password_hash`, `created_at`
- **Campaign** — `id`, `name`, `subject`, `body` (text), `status` (`draft` | `sending` | `scheduled` | `sent`), `scheduled_at` (nullable), `created_by` (FK → User), `created_at`, `updated_at`
- **Recipient** — `id`, `email` (unique), `name`, `created_at`
- **CampaignRecipient** — `campaign_id` (FK), `recipient_id` (FK), `sent_at` (nullable), `opened_at` (nullable), `status` (`pending` | `sent` | `failed`)

**Indexing** — add and be able to explain, at minimum:
- Unique index on `users.email` and `recipients.email`
- Index on `campaigns.created_by` (list-by-user queries)
- Index on `campaigns.status` and `campaigns.scheduled_at` (scheduler scans)
- Composite primary key or unique index on `(campaign_id, recipient_id)` in `CampaignRecipient`
- Index on `campaign_recipients.campaign_id` for stats aggregation

Password must be hashed (bcrypt/argon2) — never stored in plaintext, never returned over the wire.

---

## 6. API Contract (REST)

All `/campaigns` and `/recipients` routes require a valid JWT. Return appropriate status codes (`400`, `401`, `403`, `404`, `409`, `422`) — don't return `500` for client-caused errors, and don't return `200` for failures.

**Auth**
- `POST /auth/register` — create user
- `POST /auth/login` — return JWT

**Recipients**
- `GET /recipients` — list recipients
- `POST /recipients` — create recipient

**Campaigns**
- `GET /campaigns` — list (paginated)
- `POST /campaigns` — create (starts as `draft`)
- `GET /campaigns/:id` — detail + recipient stats
- `PATCH /campaigns/:id` — update (**only if `status === 'draft'`**)
- `DELETE /campaigns/:id` — delete (**only if `status === 'draft'`**)
- `POST /campaigns/:id/schedule` — set `scheduled_at` and transition to `scheduled`
- `POST /campaigns/:id/send` — simulate **asynchronous** send; each recipient is marked `sent` or `failed` (randomized to simulate real-world delivery)
- `GET /campaigns/:id/stats` — return the stats shape below

**Stats response shape**

```json
{ "total": 0, "sent": 0, "failed": 0, "opened": 0, "open_rate": 0, "send_rate": 0 }
```

- `send_rate = sent / total`
- `open_rate = opened / sent` (guard against divide-by-zero; return `0` when `sent === 0`)

---

## 7. Business Rules (Enforce Server-Side, Always)

- A campaign can only be **edited** or **deleted** when `status === 'draft'`. Attempts otherwise → `409 Conflict`.
- `scheduled_at` must be a **future** timestamp. Past timestamps → `422`.
- Sending is **one-way**: once a campaign reaches `sent`, it cannot be reverted.
- The send pipeline should transition: `draft | scheduled` → `sending` → `sent`. Do not skip `sending` if you model async work.
- Users can only access campaigns they created (`created_by === req.user.id`). Cross-tenant access → `404` (prefer 404 over 403 to avoid leaking existence).
- Wrap multi-step writes (e.g., create campaign + attach recipients) in a **transaction**.
- Validate every payload with Zod/Joi before it reaches the service layer.

---

## 8. Frontend Requirements

**Pages**
- `/login` — form; store JWT in memory or httpOnly cookie (prefer httpOnly cookie if you can wire it cleanly; document the choice)
- `/campaigns` — list with status badges, pagination or infinite scroll
- `/campaigns/new` — create form (name, subject, body, recipient emails)
- `/campaigns/:id` — detail view: stats, recipient list, action buttons

**UI rules**
- Status badges: `draft` = grey, `scheduled` = blue, `sending` = amber (add this — requirements imply it), `sent` = green
- Action buttons (Schedule, Send, Delete) are conditionally rendered based on current `status`
- Stats as a progress bar or simple chart (open rate and send rate)
- **Loading states** everywhere (skeletons or spinners) — no blank screens during fetch
- **Error states** everywhere — surface API error messages meaningfully; never show a raw stack trace
- Use React Query/SWR cache invalidation properly after mutations — don't force page reloads

---

## 9. Testing Requirements

Minimum: **3 meaningful tests** for critical business logic. "Meaningful" = would fail if a real regression were introduced. Good candidates:

1. Cannot edit/delete a campaign once `status !== 'draft'` (expect `409`)
2. `scheduled_at` in the past is rejected (expect `422`)
3. `/stats` computes rates correctly, including the `sent === 0` divide-by-zero case
4. (Bonus) JWT middleware rejects missing/expired/malformed tokens
5. (Bonus) User A cannot read/modify User B's campaign

Keep tests hermetic — use a test database or transactions that roll back.

---

## 10. AI Usage Documentation (Required in README)

The README must include a section titled **"How I Used Claude Code"** with:

1. What tasks you delegated to Claude Code
2. 2–3 real prompts you used (verbatim)
3. Where Claude Code was wrong and needed correction
4. What you would not let Claude Code do — and why

Be truthful. Fabricated prompts or whitewashed corrections defeat the purpose of this section.

---

## 11. Known Ambiguities — Resolve Before Coding

Flag these to the user if unresolved:

1. **`opened_at` mechanism.** No endpoint exists to mark a recipient as "opened." Decide: seed some randomly during `/send` simulation, or add a `POST /campaigns/:id/recipients/:rid/open` tracking endpoint? Document the choice.
2. **Async send simulation.** "Asynchronous" could mean a background worker, a `setTimeout` queue, or a simple `Promise.all` with artificial delay. The simplest honest option is an in-process job — document whatever you pick and note how it would scale to a real queue (BullMQ, pg-boss).
3. **Recipient attachment on campaign create.** The create form accepts "recipient emails" — decide whether unknown emails auto-create `Recipient` rows or require prior registration via `POST /recipients`.
4. **JWT storage.** In-memory (simpler, lost on refresh) vs httpOnly cookie (survives refresh, needs CSRF handling). Pick one and justify.
5. **State library.** Zustand or Redux — Zustand is lower-overhead for this scope; Redux is fine if you want to demonstrate it. Either is acceptable; don't use both.

---

## 12. Definition of Done

A task is not done until:

- [ ] Business rules enforced server-side and covered by at least one test where applicable
- [ ] All endpoints return correct status codes and response shapes
- [ ] Inputs validated with Zod/Joi before hitting services
- [ ] Loading and error states implemented on every screen that fetches
- [ ] `docker compose up` brings up Postgres, backend, and frontend cleanly
- [ ] Seed script or demo data available
- [ ] README covers setup, architecture choices, and the "How I Used Claude Code" section
- [ ] No secrets, tokens, or `.env` files committed
- [ ] Linter and type-checker are clean

---

## 13. Before You Start Any Task

Run this checklist in your head:

1. Have I read this CLAUDE.md recently? If not, re-read it.
2. What section(s) of the requirements does this task touch?
3. What invariants from §7 apply?
4. What's the smallest change that satisfies the requirement?
5. What will I test to prove it works?
6. What could break, and how will I handle it?

Only then: write code.