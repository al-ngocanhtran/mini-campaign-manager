# UX & A11y Demo Polish Implementation Plan

## Overview

`plans/README.md` enumerates 10 UX + 11 A11y findings. The user picked the **Tier M** subset (HIGH-severity items + cheap signal-of-care wins) for a demo audience.

After re-reading the actual frontend code, **7 of the 11 picked items are already shipped** but the README never marked them resolved. The frontend already handles: schedule input `min` and label association, recipient email validation through `AddRecipientDialog`, sending-state UI on the detail page, keyboard-focusable list rows via `<Link>`-with-overlay pattern, light-mode `--muted-foreground` contrast (token already at `oklch(0.44 …)`), the global `prefers-reduced-motion` override, and skeleton `aria-busy` announcements.

Four findings remain genuinely open. They are small, visible during a demo walkthrough, and respect demo scope (no backend, no infra). Total effort: **~1.5 hours of code + a brief README hygiene pass**.

## Current State Analysis

### Already resolved (no work needed)

| Finding | Evidence |
|---|---|
| `UX-002` schedule `min` | `frontend/src/pages/CampaignNew.tsx:25-27,186` and `frontend/src/pages/CampaignDetail.tsx:81-83,482` set `min={minScheduleAt}` to `now + 60s` |
| `UX-003` per-email validation | Recipients flow through `RecipientPicker` (server-validated `/recipients` list) and `AddRecipientDialog.tsx:49` runs `validateEmail` before `POST /recipients`. The "create form is a textarea" claim is stale. |
| `UX-006` `sending`-state UI | `frontend/src/pages/CampaignDetail.tsx:509-513` renders a `status-crawl` "Sending in progress" line for the `sending` state. |
| `A11Y-001` table keyboard nav | `frontend/src/pages/Campaigns.tsx:145-189` — `CampaignRow` uses a `<Link>` with `::before { inset: 0 }` overlay, so the whole row is reachable via the focusable link. The `CampaignDetail` recipient table (lines 646-693) is read-only data; rows are not actionable. |
| `A11Y-003` light-mode contrast | `frontend/src/index.css:57` — token already at `--muted-foreground: oklch(0.44 0.02 260)` with a comment noting the bump from 0.50. |
| `A11Y-005` reduced motion | `frontend/src/index.css:179-188` — global `@media (prefers-reduced-motion: reduce)` block forces all animation/transition durations to 0.01ms. Pulse, status-crawl, and fetch-bar all stop. |
| `A11Y-008` schedule label association | `frontend/src/pages/CampaignNew.tsx:175-189` and `CampaignDetail.tsx:472-485` both pair `<Label htmlFor="schedule-at">` with `<Input id="schedule-at">`. |

### Genuinely open (in scope)

| Finding | Evidence |
|---|---|
| `UX-001` Send confirm | `frontend/src/pages/CampaignDetail.tsx:449-462` — the Send button has no `AlertDialog` wrapper. The Delete button does (`DeleteDialog`, lines 723-767). Sending is irreversible per `CLAUDE.md §7`. |
| `A11Y-002` (narrowed) | `frontend/src/components/ui/alert.tsx:30` already sets `role="alert"`. The actual gap is on `frontend/src/pages/Login.tsx:135-137,154-156,194-196` — error `<p>` elements have no `id`, and the corresponding `<Input>` elements have no `aria-describedby` linking them. AT users hear `[invalid]` but not the message. |
| `A11Y-004` badge size | `frontend/src/components/StatusBadge.tsx:8` and `:41` set `text-[11px]` on `campaignBadge` and `recipientBadge`. Status semantics rendered below the 12px floor + uppercase + tracking-[0.10em] reduces legibility. |
| `A11Y-006` skip-to-content | `frontend/src/components/AppHeader.tsx` has no skip link as the first focusable element; `App.tsx` has no `<main id="main-content">` landmark target. Tab on a fresh page hits the brand link, not a skip-to-main. |

### Key discoveries

- `AlertDialog` shadcn primitive is already imported in `CampaignDetail.tsx:22-31` and exercised by `DeleteDialog` at line 733. The pattern to mirror exists in the same file.
- The `text-xs` Tailwind utility is `12px`, exactly at the floor — no need for an arbitrary value.
- Eyebrow text (`AppHeader.tsx:119,132`, `CardTitle` strings throughout) uses `text-[11px]` decoratively, not for status semantics. Those should stay 11px so the editorial typography ladder is preserved.
- Frontend has no test framework (per `INF-017`) — these changes are visual/structural and verified by hand against the demo path.

## Desired End State

- Clicking **Send now** opens an `AlertDialog` confirming "Send `<name>` now?" with explicit "this can't be undone" copy. Confirming triggers the existing `sendMutation`. Schedule remains a one-click action (it's reversible).
- Submitting `/login` with invalid input announces the field-level error via screen reader through the input's accessible description (`aria-describedby` resolves to the error `<p id>`).
- Both `StatusBadge` variants render at 12px while keeping their uppercase tracking and font-weight.
- Loading any page and pressing Tab once reveals a "Skip to content" link in the top-left; activating it focuses inside `<main>`, bypassing the header.
- `plans/README.md` strikes through the seven now-resolved IDs with a one-line evidence pointer, mirroring the existing `~~INF-014~~` resolution style.

## What We're NOT Doing

- Adding a Schedule confirmation — Schedule is reversible (PATCH `unscheduleCampaign` exists in the API client) and adding a confirm step would be friction without harm-prevention value.
- Changing color tokens — `--muted-foreground` light-mode is already WCAG AA compliant per the inline comment + token value.
- Refactoring `StatusBadge` to take an `aria-label` — visible status text is already the accessible name.
- Touching the `CampaignDetail` recipients table — rows are read-only stats, not actionable.
- Tier L additions (`UX-004` optimistic UI, `UX-005` logout toast / `?next=`, `UX-009` cancel-confirm guard, `A11Y-009` mobile dropdown name).
- Anything in **Known gaps** (security, missing features, infra) — out of demo scope per project memory.
- Adding a frontend test framework — out of demo scope per `INF-017`; verification is manual.
- Backend changes of any kind. The supertest API contract suite is unaffected by these changes.

## Implementation Approach

Five commits land sequentially. Each commit is independently shippable; the order minimizes merge friction (smallest visual changes first, dialog wrap last).

---

## Phase 1: Bump StatusBadge size

### Overview
Smallest possible diff. Both badge variants change one Tailwind class.

### Changes Required
**`frontend/src/components/StatusBadge.tsx`**
- Line 8: `"uppercase tracking-[0.10em] text-[11px] font-mono font-medium border"` → `"uppercase tracking-[0.10em] text-xs font-mono font-medium border"`
- Line 41: same change to `recipientBadge`.

### Success Criteria
- `yarn workspace campaign-manager-frontend run typecheck` and `lint` clean.
- DevTools computed `font-size` on any `StatusBadge` reads `12px`.
- Editorial styling otherwise unchanged.

### Commit
`fix(a11y): bump StatusBadge from 11px to 12px (A11Y-004)`

---

## Phase 2: Login form aria-describedby

### Overview
Wire each conditional error `<p>` to its `<Input>` via `id` + `aria-describedby`. Three inputs (email, name, password). Pattern repeats.

### Changes Required
**`frontend/src/pages/Login.tsx`**

For each of the three inputs (email at lines 124-138, name at lines 143-157, password at lines 163-196):

```tsx
<Input
  id="email"
  // …existing props
  aria-invalid={!!fieldErrors.email}
  aria-describedby={fieldErrors.email ? "email-error" : undefined}
/>
{fieldErrors.email && (
  <p id="email-error" className="text-xs text-destructive">
    {fieldErrors.email}
  </p>
)}
```

Apply the same pattern with id `name-error` and `password-error`. Leave the password helper text (line 198-201) and the password-toggle button (lines 179-192) alone — both already have appropriate ARIA.

The top-of-form `<Alert variant="destructive">` (lines 115-119) already gets `role="alert"` from `alert.tsx:30`. No change needed.

### Success Criteria
- VoiceOver on Safari reads "<input>, invalid, <error message>" when focusing an invalid field.
- DevTools shows the input's `aria-describedby` attribute resolves to the `<p>` element's `id`.
- No visual change.

### Commit
`fix(a11y): wire aria-describedby on Login form fields (A11Y-002)`

---

## Phase 3: Skip-to-content link + main landmark

### Overview
Two-file change. Header gets a skip link as the first focusable element. `App.tsx` gets the landmark target.

### Changes Required

**`frontend/src/components/AppHeader.tsx`**

As the first child of the `<header>` (before line 38's `<Link>`):

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background"
>
  Skip to content
</a>
```

**`frontend/src/App.tsx`** *(read in implementation phase to confirm structure — likely a `<main>` wrapper inside the layout)*
- Add `id="main-content"` and `tabIndex={-1}` to the `<main>` wrapper. `tabIndex={-1}` makes it programmatically focusable so the skip link's anchor jump moves focus, not just scroll position.

If `App.tsx` does not currently use a `<main>` wrapper, add one around the `<Outlet />` route content. This is also the right place to add the landmark for general SR-user wayfinding.

### Success Criteria

- Fresh page load + Tab → skip link appears top-left, fully visible, contrasts cleanly.
- Enter on the skip link → focus lands inside `<main>`. Next Tab continues from page content, skipping the header nav.
- Sighted user sees no change unless they Tab.

### Commit
`feat(a11y): skip-to-content link + main landmark (A11Y-006)`

---

## Phase 4: Send confirmation dialog

### Overview
Mirror `DeleteDialog` (lines 723-767) for the Send action. Existing `AlertDialog*` imports cover this.

### Changes Required

**`frontend/src/pages/CampaignDetail.tsx`**

Extract the Send button (lines 449-462) into a new `SendDialog` subcomponent at the bottom of the file, alongside `DeleteDialog`. Replace the inline button with `<SendDialog campaignName={campaign.name} pending={sendMutation.isPending} onConfirm={() => sendMutation.mutate()} />` inside the existing `{canSend && …}` guard.

```tsx
function SendDialog({
  campaignName,
  onConfirm,
  pending,
}: {
  campaignName: string;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button className="w-full" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send now
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Send <span className="font-serif">{campaignName}</span> now?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Recipients will be queued immediately. Sending is permanent — once a campaign is sent, it can't be unsent.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Send now</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

Keep the existing "Queueing recipients" status-crawl line (lines 464-468) untouched — it remains the in-flight feedback. Do **not** add confirmation to the Schedule action.

### Success Criteria
- Click **Send now** on a `draft` or `scheduled` campaign → dialog opens with the campaign name in the title.
- Cancel closes without firing the mutation.
- Confirm fires `sendMutation`; the existing toast on success and "Queueing recipients" mid-send line both render as before.
- Delete behavior unchanged.

### Commit
`feat(ui): confirm dialog on irreversible Send (UX-001)`

---

## Phase 5: README hygiene

### Overview
Mark the seven resolved findings struck through with a one-line evidence pointer. Match the existing `~~INF-014~~ — **Resolved.** …` style on line 196 of `plans/README.md`.

### Changes Required

**`plans/README.md`**

For each of `UX-002`, `UX-003`, `UX-006`, `A11Y-001`, `A11Y-003`, `A11Y-005`, `A11Y-008`:

Convert the bullet from `- ID-XYZ — <description>. *(severity)*` to `- ~~ID-XYZ~~ — **Resolved.** <one-line evidence pointer>.`

Examples:
- `- ~~UX-002~~ — **Resolved.** `CampaignNew.tsx`/`CampaignDetail.tsx` set `min={now + 60s}` on the schedule input.`
- `- ~~A11Y-005~~ — **Resolved.** Global `@media (prefers-reduced-motion: reduce)` rule in `index.css:179-188`.`

### Success Criteria
- Diff is doc-only; no code touched.
- Strikethrough matches `~~INF-014~~`'s rendered appearance.
- Severity tags removed on resolved entries (resolved findings have no severity).

### Commit
`docs(plans): mark resolved UX/A11y findings in README`

---

## Verification

After all five commits land, manually exercise the demo path:

1. **Build & static checks.** From repo root:
   ```bash
   yarn workspace campaign-manager-frontend run typecheck
   yarn workspace campaign-manager-frontend run lint
   ```
   Both must exit 0. The husky `pre-push` hook will catch regressions before push.

2. **Run the stack.** `docker compose up -d` (or `yarn workspace … run dev` per workspace).

3. **UX-001.** Login as `demo@example.com` / `passworD@123`. Open or create a draft campaign. Click **Send now** — dialog appears titled "Send `<name>` now?". Cancel: nothing happens. Send: campaign transitions through `sending` (with the existing crawl line) and lands on `sent`.

4. **A11Y-002.** Open `/login`. Submit empty form. With VoiceOver active (⌘+F5), Tab through inputs — each error should be announced as the input's description, not just the bare "invalid" state. Browser DevTools: confirm each `<Input>`'s `aria-describedby` attribute matches the corresponding `<p>` element's `id`.

5. **A11Y-004.** DevTools on any campaign card or detail page badge → computed `font-size: 12px`. Visual: badges look ~1px taller; tracking and weight unchanged.

6. **A11Y-006.** Cold-load `/campaigns`. Press Tab once — "Skip to content" appears top-left, focused. Press Enter — focus moves inside `<main>`. Next Tab continues from main content, bypassing the header nav.

7. **README hygiene.** `git diff plans/README.md` shows only the seven targeted bullets converted. `INF-014`'s line is identical (used as the style reference).

## Commit log

Five atomic commits, in order:

1. `fix(a11y): bump StatusBadge from 11px to 12px (A11Y-004)`
2. `fix(a11y): wire aria-describedby on Login form fields (A11Y-002)`
3. `feat(a11y): skip-to-content link + main landmark (A11Y-006)`
4. `feat(ui): confirm dialog on irreversible Send (UX-001)`
5. `docs(plans): mark resolved UX/A11y findings in README`

All five touch only frontend or markdown — no backend, no migrations, no test infrastructure.
