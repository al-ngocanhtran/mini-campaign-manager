# Mini Campaign Manager — Release Notes

Chronological log of work shipped to mini-campaign-manager, grouped by area. Each entry links the originating plan under `plans/` and the commit that landed it.

- **Backend** — API, services, models, migrations, tests
- **Frontend** — React app, design system, UX
- **Infrastructure & Tooling** — workspaces, Docker, CI hooks, lint/type pipelines
---

## Backend

### BE01 — Port to Sequelize, fix status codes, add `sending` state, expose `/recipients` (`452105c`)

- **Scope:** Replace raw `pg` driver with Sequelize ORM across the API; align HTTP status codes with `CLAUDE.md §6`; introduce the intermediate `sending` status; mount `/recipients` routes.
- **Solution:** Class-based Sequelize models for `User`, `Campaign`, `Recipient`, `CampaignRecipient`. Update routes to return `409` on state-machine violations, `422` on semantic validation failures (e.g. `scheduled_at` in the past), `201` on resource creation, `204` on delete. Extend the campaign status enum with `sending` so the send pipeline transitions `draft|scheduled → sending → sent` instead of skipping the intermediate state.
- **Validation:** Existing test suite plus manual smoke through the frontend (login → create → schedule → send → stats).

### BE02 — Rewrite integration tests against the HTTP layer (`8e7bc51`)

- **Scope:** `backend/tests/campaigns.test.ts` — closes ENG_REVIEW finding #2 ("test suite is false confidence").
- **Solution:** Replace raw-SQL assertions with supertest end-to-end tests against the Express app. Add coverage for tenant isolation, `/send` race conditions, JWT middleware, and email-normalization edge cases. Tests now exercise routes, not internal SQL.
- **Validation:** Suite passes against a real Postgres in `campaign_manager_test`. Deliberate route regressions (e.g. returning the wrong status code) now fail tests where the prior suite would not have noticed.

### BE03 — `express-rate-limit` on `/auth` + require `JWT_SECRET` in compose (`a299d1a`)

- **Scope:** `backend/src/routes/auth.routes.ts`, `backend/src/middleware/auth.ts`, `backend/src/index.ts`, `docker-compose.yml`. Closes ENG_REVIEW #4 + #10 and gap-report `SEC-002`, `SEC-003`, `SEC-004`, `INF-004`.
- **Solution:** Mount `express-rate-limit` (10 requests / 15 minutes) on `/auth/login` and `/auth/register`. Switch the JWT secret check from a deny-list (`NODE_ENV === 'production'`) to an allow-list — only `development` and `test` get the dev-fallback warning, every other environment throws on missing secret. Compose now uses `${JWT_SECRET:?JWT_SECRET is required}` so it aborts before container start when the host shell hasn't exported the secret. `app.set('trust proxy', 1)` keeps rate-limit IPs accurate behind a reverse proxy.
- **Validation:** New `backend/tests/auth-rate-limit.test.ts` asserts an isolated app instance returns `429` after 11 rapid attempts. Manual: `unset JWT_SECRET && docker compose up` aborts before the backend container starts.

### BE04 — Timezone-strict scheduling + concurrent-send regression test (`15fcc12`)

- **Scope:** `backend/src/validation/schemas.ts`, `backend/tests/campaigns.test.ts`. Closes ENG_REVIEW #3d and the §4 test gap.
- **Solution:** `scheduleCampaignSchema` now rejects ISO strings without an explicit timezone offset via regex (`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$`). Returning `400` on naive strings prevents server-locale-dependent interpretation when Postgres stores `timestamp with time zone`. Adds the missing concurrent-send test: two parallel `POST /:id/send` requests must yield exactly one `200` and one `409` (verifies the atomic CAS gate at `routes/campaigns.ts`).
- **Validation:** `yarn test` green, including the new concurrency case. Frontend timezone fix shipped together (see Frontend section).

### BE05 — Drop Express generic clutter from controllers (`ca919fe`)

- **Scope:** `backend/src/controllers/*`.
- **Solution:** Cleanup pass over the controller layer introduced in the layered-refactor work. Removes verbose `Request<P, ResBody, ReqBody, ReqQuery>` parameterization in favor of `AuthRequest` typing already provided by the middleware.
- **Validation:** `yarn typecheck` and `yarn test` clean.

### BE06 — Rewrite migrations as sequelize-cli, one table per file (`e7e6ce1`)

- **Scope:** `backend/migrations/`, `backend/config/config.cjs`, plus a NOT-NULL tightening migration.
- **Solution:** Replace the ad-hoc `001_initial.sql` blob with sequelize-cli forward-only migrations split per table — `001-create-users.cjs`, `002-create-recipients.cjs`, `003-create-campaigns.cjs`, `004-create-campaign-recipients.cjs`, `005-tighten-not-null.cjs`. Each migration owns a single concern and runs through `sequelize db:migrate` with proper ledger tracking.
- **Validation:** Fresh database boots cleanly via `yarn migrate`; existing data unaffected on incremental upgrades.

### BE07 — Split routes → controllers → services + centralized error handling (`6e91dda`)

- **Scope:** New `backend/src/{controllers,services,errors}/`, new `backend/src/middleware/{validate.ts,error-handler.ts}`, route files renamed to `*.routes.ts`. Implements `plans/2026-05-09-backend-layered-refactor.md`; closes ENG_REVIEW #13 (service/repo layer, previously deferred).
- **Solution:** Three layers with strict responsibilities — routes own HTTP shape and middleware mounting, controllers translate HTTP↔service, services hold business rules and own transactions. Typed `HttpError` subclasses (`ValidationError`, `NotFoundError`, `ConflictError`, `UnprocessableError`, `UnauthorizedError`) thrown from services map to HTTP via a single `error-handler` middleware. `validate(schema, source)` middleware factory parses `req.body|params|query` with Zod, overwrites the source with the parsed (and coerced) value, throws `ValidationError` on failure. ESLint `no-restricted-imports` override on `src/controllers/**` blocks `sequelize`, `db.js`, and `models/*` imports — the layer boundary fails lint, not just code review.
- **Validation:** Full supertest suite passes byte-identical (the contract is the test). Sanity check confirmed: temporarily importing a model into a controller fails `yarn lint` with the rule's message.

### BE08 — Backend ESLint config, production tsconfig, drop unused `src/` entrypoints (`d781fd4`)

- **Scope:** `backend/eslint.config.js` (new), `backend/tsconfig.build.json`, `backend/package.json`. Closes the backend half of `plans/2026-04-28-setup-script-lint-husky.md`.
- **Solution:** Mirror the frontend's flat-config setup (`@eslint/js` + `typescript-eslint`) with Node globals and `dist`/`coverage` ignored. Add a build-only tsconfig that emits `dist/` for the production image. Delete legacy `src/migrate.ts` / `src/seed.ts` entries — the canonical scripts live under `backend/scripts/` and `sequelize-cli`.
- **Validation:** `yarn workspace campaign-manager-backend run lint` exits `0`. `yarn workspace campaign-manager-backend run build` emits a clean `dist/`. Deliberate `let x: any = 1` is rejected by lint.

### BE09 — Idempotent migration ups + tighten timestamp NOT NULL (`e2bd00b`)

- **Scope:** `backend/migrations/`.
- **Solution:** Migration `up()` blocks become re-runnable against a partially-applied schema (lookup-or-create guards in front of `createTable`/`addColumn`/`addIndex`). Same change tightens `created_at` / `updated_at` to NOT NULL across `users`, `recipients`, `campaigns`, `campaign_recipients` — the original migrations had left them nullable. Backfill (`UPDATE ... SET col = NOW() WHERE col IS NULL`) runs before each constraint addition so the migration doesn't blow up on a populated database.
- **Validation:** `yarn db:reset` clean against an empty DB and against a half-applied one. `\d campaigns` shows NOT NULL on both timestamp columns.

### BE10 — Split campaigns test suite into auth / recipients files; serialize runs (`7cba5ab`)

- **Scope:** `backend/tests/auth.test.ts` (new), `backend/tests/recipients.test.ts` (new), `backend/tests/campaigns.test.ts` (slimmed), `backend/vitest.config.ts`.
- **Solution:** The single `campaigns.test.ts` had grown to cover auth flows and recipient endpoints alongside the campaign state machine. Carve it into three focused files. Switch vitest to `pool: 'forks'` with a single fork so suites that share `sequelize.sync({ force: true })` against the test DB don't race on schema rebuilds.
- **Validation:** `yarn test` green; `yarn test auth` filters to the auth file (forwarding extra args via `scripts/test.sh`); back-to-back runs no longer flake.

### BE11 — Centralize env loading into `src/config/` (uncommitted)

- **Scope:** New `backend/src/config/index.ts`; consumed by `db.ts`, `index.ts`, `middleware/auth.ts`, `routes/auth.routes.ts`. Adds `dotenv` to backend dependencies.
- **Solution:** One module owns env parsing. Loads `.env` from the monorepo root first, then `backend/.env`, with `override: false` so test files that set vars before importing config still win. Validates `JWT_SECRET` (required outside `test`) and `JWT_EXPIRES_IN` (required everywhere, regex-checked: `^\d+(ms|s|m|h|d|w|y)?$`) at module load. Exposes a typed `config` object — `port`, `databaseUrl`, `corsOrigin`, `jwtSecret`, `jwtExpiresIn`, `rateLimitDisabled`, `isTest`. Removes the duplicated env-reading logic that was scattered across `auth.ts` and `db.ts`. Per project convention (no Zod around env loading) — plain reads with `||` defaults and inline throws for required values.
- **Validation:** `yarn typecheck` clean; tests still pass byte-identical; misconfigured env throws at module load with the env name in the message, instead of producing a cryptic JWT error at first sign.

### BE12 — Pivot to shared multi-user workspace; surface creator on every campaign response (uncommitted)

- **Scope:** `backend/src/services/campaigns.service.ts`, `backend/src/controllers/campaigns.controller.ts`, `backend/tests/campaigns.test.ts`. Implements `plans/2026-05-09-add-creator-info.md` with one deliberate divergence (see below).
- **Solution:** The demo flips from per-user campaigns to a shared multi-user workspace so seed data with five admins reads like a team. Service methods drop the `userId` parameter; queries no longer filter by `created_by`; the cross-tenant `404` tests come out. Attribution is preserved by including `creator: { id, name, email }` on every campaign response via a Sequelize `include` on the existing `Campaign.belongsTo(User, { as: 'creator' })` association. `listCampaigns` widens its `GROUP BY` to `["Campaign.id", "creator.id"]` so Postgres' functional-dependency rule lets `creator.name` / `creator.email` ride along with the count aggregate. `password_hash` is never in the projection — a regression test asserts it.
- **Tradeoff:** The plan said "multi-tenant authorization stays unchanged"; implementation chose otherwise once the bulk seeder (BE13) made the shared-workspace UX visibly better. Auth still gates the entire surface — the change is to authorization scope, not authentication. CLAUDE.md §6 ("Users can only access their own campaigns") still describes the old contract and would need a follow-up edit if this stays.
- **Validation:** New test block asserts `creator` shape on `GET /campaigns` and `GET /campaigns/:id`, plus that `password_hash` never appears on the creator object. Tenant-isolation tests removed in the same change.

### BE13 — Bulk seeder: 5 admins, 30 recipients, 20 campaigns (uncommitted)

- **Scope:** `backend/seeders/002-bulk-campaigns.cjs`.
- **Solution:** Idempotent seeder that creates `admin1@example.com .. admin5@example.com` (password `passworD@123`, bcrypt rounds 12), 30 numbered recipients, and 20 campaigns whose subject + body are sampled from a small template pool with creators round-robin'd across the five admins. Wrapped in a single `queryInterface.sequelize.transaction`. Lookup-then-skip pattern (`SELECT id FROM users WHERE email IN (:emails)`) means re-running `yarn seed` after a partial run doesn't double-insert.
- **Validation:** `yarn db:reset && yarn seed` produces the expected counts; a second `yarn seed` is a no-op (no duplicate-key errors, no row count drift).

---

## Frontend

### FE01 — `sending` status badge, `/recipients` proxy, JWT rehydration, 401 logout (`9d26dbb`)

- **Scope:** `frontend/src/api/client.ts`, `frontend/src/store/authSlice.ts`, `frontend/src/components/StatusBadge.tsx`, list/detail pages, Vite dev proxy. Closes ENG_REVIEW #2a, #2b, #8, #9.
- **Solution:** Persist the auth slice through `localStorage` so the JWT survives a refresh; rehydrate on store init. Add a 401 interceptor in the API client that dispatches `logout()` and bounces the user to `/login` instead of leaving stale state in Redux. Render the `sending` badge variant alongside `draft`/`scheduled`/`sent`. Wire the Vite dev proxy for `/recipients` so the new endpoint is reachable from the SPA.
- **Validation:** Manual: refresh-then-still-logged-in works; expired JWT mid-flow drops the user back to `/login` cleanly; the badge renders all four states.

### FE02 — Adopt shadcn/ui, redesign pages, ship dark theme + dialog refactor + timezone fix (`f8e8032`)

- **Scope:** `frontend/src/components/ui/*` (shadcn primitives), `RecipientPicker.tsx`, `AddRecipientDialog.tsx`, `AppHeader.tsx`, `PageHeader.tsx`, `PageFetchBar.tsx`, `mode-toggle.tsx`, `theme-provider.tsx`, `index.css`, every page component. Implements `plans/2026-04-28-add-recipient-dialog-refactor.md`, `plans/2026-04-28-dark-theme-direct-toggle.md`, and the frontend half of the timezone fix (closes `UX-011` and ENG_REVIEW #3d frontend half).
- **Solution:** Four threads land together because they share the same files:
  1. **Design system.** Adopt shadcn/ui primitives (Button, Dialog, Table, Sheet, Sonner toaster, AlertDialog, Card, Skeleton, etc.) with Tailwind v4 design tokens. Rewrite `Login`, `Campaigns`, `CampaignNew`, `CampaignDetail` on the new system. New shell components: `AppHeader` (mobile sheet + desktop nav), `PageHeader`, `PageFetchBar`.
  2. **Dialog refactor.** Move the inline "add new recipient" form out of `RecipientPicker` and into a Radix `Dialog` portal (`AddRecipientDialog.tsx`). Fixes the React 19 hydration warning `<form> cannot be a descendant of <form>` that was firing inside the campaign create/edit forms. The picker keeps selection state; the dialog owns its own form, mutation, and reset logic.
  3. **Dark theme.** Replace the 3-state Light/Dark/System dropdown with a single Sun/Moon toggle reading `resolvedTheme` (so OS preference still drives first paint). Replace the cool-zinc palette with a warm-grey editorial palette built on a 5-tier elevation ramp (`--surface-0` through `--surface-4`) and desaturated accents — accents and destructive each clear WCAG AA against every elevation tier, body text at full white. Closes `UX-011`'s dark-theme-as-token-inversion finding.
  4. **Timezone fix.** Convert `<input type="datetime-local">` values to UTC ISO with `new Date(local).toISOString()` before submitting `scheduled_at`. Pairs with the backend regex that now rejects offset-less strings.
- **Solution (cont'd):** `ApiError` class surfaces field-level validation errors to forms (consumes the `{error, fields}` envelope). `unscheduleCampaign` and `recipientEmails` added to the PATCH client. `@/*` path alias for shadcn-style imports. Vite dev proxy bypasses HTML navigations so SPA reloads on `/campaigns`, `/auth`, `/recipients` hit the app shell instead of the API.
- **Validation:** `yarn typecheck` + `yarn lint` clean. Manual: no nested-form hydration warning when adding a recipient from `/campaigns/new` or edit-draft mode; theme toggle persists across refresh and overrides OS preference after one click; dark-mode contrast verified with a WCAG calculator on every (foreground, surface-N) pair; schedule payload submits with explicit timezone offset.

### FE03 — UX/A11y demo polish: Send confirm, Login aria, badge size (`90ece55..3a30837`)

- **Scope:** `frontend/src/pages/CampaignDetail.tsx`, `frontend/src/pages/Login.tsx`, `frontend/src/components/StatusBadge.tsx`. Implements `plans/2026-05-09-ux-a11y-demo-polish.md`; closes `UX-001`, `A11Y-002`, `A11Y-004`. The plan's frontend audit also closed `UX-002`, `UX-003`, `UX-006`, `A11Y-001`, `A11Y-003`, `A11Y-005`, `A11Y-006`, `A11Y-008` against code already in place.
- **Solution:** Three small threads, one commit each:
  1. **Send confirm.** New `SendDialog` subcomponent mirrors the existing `DeleteDialog` — clicking **Send now** opens an `AlertDialog` titled "Send `<name>` now?" with explicit "can't be unsent" copy. Sending is irreversible per `CLAUDE.md §7`. Schedule stays one-click (reversible via `unscheduleCampaign`).
  2. **Login aria-describedby.** Wire each field's error `<p>` to its `<Input>` via `id` + `aria-describedby` on email/name/password. The form-level `<Alert variant="destructive">` already gets `role="alert"` from the shadcn primitive — AT users now hear both the summary message and the field-level cause.
  3. **Status badge size.** Both `campaignBadge` and `recipientBadge` bump from `text-[11px]` to `text-xs` (12px, the WCAG floor). Uppercase tracking and weight preserved; editorial 11px eyebrows elsewhere left alone.
- **Validation:** `yarn lint` + `yarn typecheck` clean. Manual: VoiceOver on `/login` announces each field error as the input's description; Send button on a draft opens the dialog with the campaign name in the title; computed `font-size` on any `StatusBadge` reads `12px`.

### FE04 — Creator column on dashboard, mobile card footer; Login mode toggle (uncommitted)

- **Scope:** `frontend/src/api/client.ts`, `frontend/src/pages/Campaigns.tsx`, `frontend/src/pages/Login.tsx`. Frontend half of `plans/2026-05-09-add-creator-info.md`.
- **Solution:** Add `creator: { id, name, email }` as a required field on the `Campaign` interface — BE12 makes it always present, so no optional-chaining noise at the call sites. Desktop table gains a "Created by" column between Recipients and Scheduled rendering `c.creator.name`; the row-as-link overlay still works because the new cell sits inside the same `<TableRow>` that owns the link's `::before`. Mobile card footer reads `{N} RECIPIENTS · {CREATOR_NAME}`. `Login` gets the same `<ModeToggle>` button the rest of the app uses, fixed top-right, so the unauthenticated screen isn't stuck in whichever theme the OS picked. Drops `unscheduleCampaign` from the API client (no consumer left after FE02).
- **Validation:** `yarn typecheck` + `yarn lint` clean. Manual: dashboard shows the creator name on every row; mobile layout stays single-line for short names; login screen toggles light/dark before sign-in and the choice persists into the app shell.

---

## Infrastructure & Tooling

### IN01 — Yarn workspaces monorepo (`7637284`)

- **Scope:** Repo root.
- **Solution:** Convert the project to Yarn 4 workspaces with `nodeLinker: node-modules` (`.yarnrc.yml`), `packageManager: yarn@4.5.0`. Root `package.json` defines per-workspace dev/test scripts; `backend/` and `frontend/` become independently versioned workspaces under one lockfile.
- **Validation:** `yarn install` resolves both workspaces from a clean clone. Per-workspace scripts (`yarn workspace ... run dev`) work as expected.

### IN02 — Full-stack Docker compose (`cdd628d`)

- **Scope:** `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`.
- **Solution:** Compose wires three services — Postgres 16, backend, frontend — with a Postgres healthcheck and `depends_on: condition: service_healthy` so the backend container waits for the DB. Backend container chains `migrate && start` on boot for first-run convenience.
- **Validation:** `docker compose up -d` from the repo root brings the stack to a working login at `http://localhost:5173` with `demo@example.com / passworD@123`.

### IN05 — Re-runnable setup + day-to-day ops scripts (`7ca0032`)

- **Scope:** Root `package.json`, `scripts/{start,stop,clean,logs,db-reset,test}.sh`. Follow-on from `plans/2026-04-28-setup-script-lint-husky.md`.
- **Solution:** Add `yarn start | stop | clean | logs | db:reset | test` aggregates that wrap the corresponding scripts under `scripts/`. `yarn dev` runs both workspaces concurrently via `concurrently -n be,fe -c blue,green` (added as a root devDependency). `scripts/test.sh` is the load-bearing one — brings up the docker-compose postgres if it's not already running, creates `campaign_manager_test` if it doesn't exist, then runs `yarn workspace campaign-manager-backend run test` with `DATABASE_URL` pointed at it. Forwards extra args (`yarn test auth` → `vitest auth`). Every script is idempotent so the README doesn't have to enumerate first-run vs subsequent-run steps.
- **Validation:** `yarn setup` from a clean clone brings the stack to a working login. `yarn test` works on a host where `psql` / `createdb` aren't installed. `yarn db:reset` drops + recreates the dev DB and re-seeds without manual SQL.

### IN06 — Untrack `.yarn/install-state.gz`; gitignore Yarn Berry runtime cache (`82bcfdd`)

- **Scope:** `.gitignore`.
- **Solution:** Yarn 4's runtime install cache (`.yarn/install-state.gz`) was being committed because the initial `.gitignore` only excluded `.yarn/cache/` and friends. Add `install-state.gz` to the ignore list and `git rm --cached` the tracked copy. Stops noisy diffs after every `yarn install`.
- **Validation:** `git status` clean immediately after `yarn install`; the file no longer surfaces in PR diffs.

### IN04 — Honor `VITE_PROXY_TARGET` in dev proxy (uncommitted)

- **Scope:** `frontend/vite.config.ts`.
- **Solution:** Read the proxy target from `process.env.VITE_PROXY_TARGET`, defaulting to `http://localhost:3001`. Compose already injects `VITE_PROXY_TARGET=http://backend:3001` into the frontend service, but the config hardcoded `localhost:3001` — inside the frontend container that resolves to the container itself, so every `/auth`, `/campaigns`, `/recipients`, `/health` request died with `ECONNREFUSED`. Default preserves the host-run dev workflow; compose runs now route through the docker network.
- **Validation:** `docker compose up -d --build frontend` then login at `http://localhost:5173` succeeds; container logs no longer show `[vite] http proxy error: /auth/login`.

### IN03 — Husky pre-push + monorepo lint/typecheck scripts + setup script (`e419029`)

- **Scope:** Root `package.json`, `.husky/pre-push`, `scripts/setup.sh`, `frontend/package.json`. Implements the root half of `plans/2026-04-28-setup-script-lint-husky.md`.
- **Solution:** Aggregate `yarn lint` and `yarn typecheck` scripts at the repo root run both workspaces sequentially. Husky `prepare` script auto-installs the hook on `yarn install`. `.husky/pre-push` runs `yarn lint && yarn typecheck` before any push leaves the dev machine — emergency bypass via `git push --no-verify`. `scripts/setup.sh` is a one-command idempotent Docker bring-up: copies `.env.example` if missing, builds and starts the compose stack, runs migrations + seed, prints the success block. Frontend gets a `typecheck` script (`tsc -b --noEmit`) so the aggregate has something to call.
- **Validation:** Deliberate lint or type errors fail `git push`. `yarn setup` brings up the entire stack from a clean tree and prints the success block. `git push --no-verify` confirms the bypass works.
