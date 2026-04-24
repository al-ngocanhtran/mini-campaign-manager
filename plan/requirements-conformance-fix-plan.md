# Requirements Conformance Fix Plan

**Source audit:** `COMPLIANCE_AUDIT.md` + business-analyst gap analysis (2026-04-24)
**Target:** Bring codebase to conformance with `REQUIREMENTS.md` (v2) and `CLAUDE.md` §12 Definition of Done
**Baseline score:** 5.5 / 10 — Not shippable

---

## Dependency Logic

- **Phase 1 blocks everything.** Moving to Yarn workspaces changes all paths; swapping raw `pg` for Sequelize rewrites every query. Doing feature fixes before these means redoing them.
- **Phases 2–4** parallelize because tasks touch different files (migration, frontend types, tests, docs don't conflict).
- **Frontend `sending` badge (3A)** must wait for **backend `sending` status (2A)** — shared type contract.
- **Tests (3C)** must wait for bug fixes (2C, 2D) — otherwise they're written against broken behavior.

---

## Phase 1 — Foundation (SEQUENTIAL — must complete in order)

| # | Task | Subagent | Rationale |
|---|---|---|---|
| 1.1 | **Yarn workspaces restructure**: root `package.json` with `"workspaces": ["packages/*"]`; move `backend/` → `packages/backend/`, `frontend/` → `packages/frontend/`; verify `yarn install` from root resolves both | `feature-dev:code-architect` | All downstream paths depend on final layout |
| 1.2 | **Sequelize migration**: define models (User, Campaign, Recipient, CampaignRecipient); replace every raw query in `routes/auth.ts` + `routes/campaigns.ts` + `seed.ts`; preserve transaction semantics; keep SQL migrations or convert to Sequelize migrations | `feature-dev:code-architect` | Rewriting queries twice is waste — must land before route-level fixes |

**Gate:** existing test suite passes against Sequelize before Phase 2 begins.

---

## Phase 2 — Schema + business rules (PARALLEL — 4 concurrent tracks)

| Track | Task | Subagent | Evidence |
|---|---|---|---|
| 2A | Add `'sending'` to `Campaign.status` enum — Sequelize model + migration CHECK constraint + forward migration file | `general-purpose` | `migrations/001_initial.sql:17` |
| 2B | Create `packages/backend/src/routes/recipients.ts` — `GET /recipients` + `POST /recipients`, auth-protected, Zod-validated; mount in `index.ts` | `general-purpose` | Missing per REQUIREMENTS v2:160–161 |
| 2C | Fix HTTP status codes in `routes/campaigns.ts`: `400 → 409` at lines 154, 200, 227, 255 (status-transition conflicts); past `scheduled_at` → `422` in schedule handler | `general-purpose` | CLAUDE.md §6/§7 |
| 2D | Fix `/stats` open_rate: change denominator from `total` → `sent`, guard on `sent > 0` | `general-purpose` | `campaigns.ts:328–332` |

**Gate:** backend test suite green; `curl` spot-check of status codes.

---

## Phase 3 — Feature parity (PARALLEL — 3 tracks with internal dependencies)

| Track | Task | Subagent | Depends on |
|---|---|---|---|
| 3A | **Frontend `sending` support**: add `"sending"` to `Campaign.status` union in `api/client.ts:88`; add amber variant + `"sending"` key to `StatusBadge` colors map and prop type; review conditional action buttons in `CampaignDetail.tsx` | `web-dev:web-dev` | 2A |
| 3B | **Real async send**: `/send` sets `status='sending'` + returns `202 Accepted` immediately; processes recipients via `setImmediate` (or minimal queue) off the request path; transitions to `sent` on completion; inline comment documenting BullMQ/pg-boss scale-out path | `feature-dev:code-architect` | 2A |
| 3C | **Add 3 missing tests**: (a) past `scheduled_at` → `422`; (b) `/stats` with `sent===0` returns `open_rate: 0`; (c) HTTP-level `DELETE` on non-draft → `409` (replace weak DB-only test at `campaigns.test.ts:114–127`) | `general-purpose` | 2C, 2D |

**Gate:** full test suite + frontend type-check green.

---

## Phase 4 — Polish (PARALLEL — 5 fully independent tracks)

| Track | Task | Subagent |
|---|---|---|
| 4A | Write `README.md`: setup (`docker compose up` → migrate → seed), architecture decisions (why Sequelize, JWT in-memory tradeoff, `opened_at` strategy, async send approach), **"How I Used Claude Code"** section with all 4 required subsections (tasks delegated, verbatim prompts, where Claude was wrong, what you wouldn't let Claude do) | `voltagent-biz:technical-writer` |
| 4B | Extend `docker-compose.yml` with backend + frontend services so `docker compose up` starts the full stack | `general-purpose` |
| 4C | Verify repo-root `.gitignore` covers `.env`, `node_modules/`, build outputs, `.DS_Store` (currently only frontend-level ignore exists) | `general-purpose` |
| 4D | Enable `"strict": true` in `packages/frontend/tsconfig.app.json`; fix resulting type errors | `web-dev:web-dev` |
| 4E | Randomize `opened_at` during send simulation (~30% of `sent` recipients get `opened_at = NOW()`) so open-rate metric is meaningful in demos | `general-purpose` |

---

## Phase 5 — Final review (SEQUENTIAL — single pass)

| Task | Subagent |
|---|---|
| Full-diff review against `REQUIREMENTS.md` + `CLAUDE.md` §12 Definition of Done checklist; flag remaining gaps and stack deviations | `feature-dev:code-reviewer` |

---

## Wall-Clock Estimate

| Phase | Time (parallel) | Time (sequential equivalent) |
|---|---|---|
| 1 — Foundation | 4–6h | 4–6h |
| 2 — Schema + rules | 1.5h | ~4h |
| 3 — Feature parity | 2h | ~5h |
| 4 — Polish | 1.5h | ~4h |
| 5 — Final review | 0.5h | 0.5h |
| **Total** | **~9.5–11.5h** | **~17.5–19.5h** |

---

## Risks & Open Decisions

1. **Sequelize swap is the largest single lift (~3–5h).** If time-boxed under 8h total, consider asking the reviewer whether raw `pg` is acceptable and documenting the deviation in README instead of rewriting. Recommendation: **push back on Sequelize unless time budget is confirmed** — the raw `pg` code is already solid, parameterized, and transactional.
2. **Workspace restructure side effects.** Docker volume paths, VS Code workspaces, CI configs, and any hardcoded paths in `package.json` scripts need verification after the move.
3. **Async send semantics.** Need confirmation whether 202-then-background is acceptable vs. a full queue (BullMQ / pg-boss). Recommendation: **202 + `setImmediate`** with an inline comment documenting the BullMQ upgrade path.
4. **`opened_at` simulation.** Undocumented in CLAUDE.md §11 item 1 — needs explicit decision captured in README.
5. **JWT storage.** In-memory via Redux (lost on refresh) — documented tradeoff vs. switching to httpOnly cookie (needs CSRF handling).

---

## Subagent Assignment Summary

| Subagent | Tasks |
|---|---|
| `feature-dev:code-architect` | 1.1, 1.2, 3B (design-heavy refactors + async architecture) |
| `general-purpose` | 2A, 2B, 2C, 2D, 3C, 4B, 4C, 4E (mechanical code changes) |
| `web-dev:web-dev` | 3A, 4D (frontend React + TypeScript work) |
| `voltagent-biz:technical-writer` | 4A (README + AI usage documentation) |
| `feature-dev:code-reviewer` | Phase 5 (final conformance review) |

---

## Kick-Off Checklist

- [ ] Confirm Sequelize swap is in scope (vs. documenting raw `pg` deviation)
- [ ] Confirm workspace restructure is in scope
- [ ] Confirm async send approach (202 + setImmediate vs. full queue)
- [ ] Start Phase 1.1 (workspace restructure) — blocks all other work
