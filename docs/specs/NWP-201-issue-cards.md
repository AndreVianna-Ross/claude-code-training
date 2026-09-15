# SPEC · NWP-201 — Issue virtual cards from the console

**Ticket:** [NWP-201](../tickets/NWP-201.md) · **Author:** Andre Vianna · **Status:** built

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand. It takes hours, happens twelve to twenty times a week, and last month two cards went out with the wrong spend limit because the request lived in a Slack thread (`docs/tickets/NWP-201.md:17`).

## Current state

No card code existed: no `Card`, no `CardStatus`, no `cards` slice, no `/cards` route. What did exist and had to be reused:

- `src/lib/money.ts:15` `formatMoney(minorUnits, currency)`, the one formatter; `:46` `parseAmountToMinorUnits` converts a typed `"250.00"` and returns `null` otherwise — the boundary parser the form needs, already written.
- `src/lib/dates.ts:22` `formatInZone(iso, timezone)`; `:31` `formatDate`. Display converts; storage does not.
- `src/data/store.ts:16` the `Store` interface, held on `globalThis` (`:34`) so reloads keep writes. **A new slice needs a server restart, not a hot reload.**
- `src/data/merchants.ts:7` ten merchants, each with exactly one currency and **no category field** — so the category lock belongs on the card, and the card-currency rule is decidable.
- `src/components/ui/payments/StatusBadge.tsx:5` the badge idiom: `LABELS`/`DOTS`/`VARIANTS` keyed by a status union. `src/app/payments/[id]/page.tsx` the detail-page idiom: back link, `notFound()`, `<h1>`, `Divider`, `<dl>`.
- `src/components/` has `Drawer` (the only `@radix-ui/react-dialog` wrapper), `Button`, `Input`, `Select`, `Badge`, `Table`. **No Dialog**, despite `.claude/rules/components.md:9` claiming one; no progress bar.
- `vitest.config.ts:13` node environment over `src/**/*.test.ts`. Pure modules test; `.tsx` does not load.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| Money is integer minor units; `$250.00` is `25000`. Format once, at the edge. | ticket rule 1; ORG-1/ORG-2 | A limit stored as `250.00` drifts; two cards already went out wrong |
| Never persist or display a full number after creation — last four and a reference only. | ticket rule 2; `cards.md:12` | A PAN in the store is readable from every payload forever |
| `active ⇄ frozen`, either to `cancelled`, `cancelled` terminal. | ticket rule 3; `cards.md:14` | A cancelled card comes back to life |
| Generate on the server. | `cards.md:11` | The client picks its own PAN |
| Every number starts `4242` with a valid Luhn digit, tests and fixtures included. | ticket rule 4; `cards.md:10` | Repository data resembles a real card |
| Allowlist everything from a client before it reaches the store. | ORG-7; `api-routes.md:8` | A hand-rolled POST sets a £50m limit on a merchant that does not exist |
| Store and bucket in UTC; convert only at display. | ORG-4/ORG-5 | Created dates land on the wrong day |
| Dialogs are operable: labels, accessible name, focus in and back, Escape closes. | `components.md:11` | The issue form is unusable by keyboard |

## Approach

Cards are a new entity, so they get their own modules rather than being wedged into the payments builder: `src/lib/card-number.ts` for PAN generation and masking, `src/lib/cards.ts` for the remaining pure rules, `src/data/cards.ts` for store access. `src/data/queries.ts` stays the one *payment* query builder, which is what ORG-6 protects.

The full number exists only as the return value of `issueCard` and the body of the creation response. The `Card` record has **no field for it**, so masking follows from the type rather than from discipline. Validation is a pure parse returning a value or per-field errors, so the route is a thin shell and every rule is testable without HTTP.

**Rejected:** storing the number and filtering it out of responses — one stray spread and the PAN is out. **Rejected:** deriving `reference` from the number — with the known `4242` BIN and the stored last four, even a slice narrows the PAN to a handful of Luhn-valid candidates, so it is drawn independently; its alphabet carries `2-9` minus the confusable `0`, `1`, `i`, `l`, `o`, and that is fine because the property that matters is independence, not the absence of digits. **Rejected:** the category on `Merchant` — the ticket calls it a card lock, and adding a field would edit protected seed data.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | change | `CardStatus`, `CardCategory`, `Card`. Minor units. **No field for the full number.** |
| `src/lib/card-number.ts` | add | The only module that ever holds a full PAN, so it stays small: `generateCardNumber` (injectable `random` so the extremes are testable), `luhnCheckDigit`, `isLuhnValid`, `maskedNumber`, `cardReference`. |
| `src/lib/cards.ts` | add | `CARD_TRANSITIONS` + `canTransition`, `isCardStatus`, `parseIssueRequest(body, merchants)`, `spendPercent`, `isSpendWarning`, the allowlists. |
| `src/lib/card-number.test.ts`, `src/lib/cards.test.ts` | add | The generator over 500 samples plus its extremes; the reference sharing no run with a number; every transition; a row per validation rejection. |
| `src/data/cards.ts` | add | `listCards()` newest first, `cardById`, `issueCard` → `{ card, number, replayed }`, `transitionCard`. |
| `src/data/cards.test.ts` | add | What pure rules cannot reach: idempotent issuing, the guard against the real store, ordering. |
| `src/data/store.ts`, `src/data/generate.ts` | change | A `cards` slice, and three cards seeded through the real generator pinned to `GENERATED_AT`: one active, one past 80% (the amber case), one frozen. |
| `src/app/api/cards/route.ts` | add | `GET` masked list. `POST`: `400 {message, fields}`, `201 {card, number}`, or `200` with `number: null` on a replay. `cache-control: no-store`. |
| `src/app/api/cards/[id]/route.ts` | add | `GET` one card (404 on a miss). `PATCH`: 400 bad status, 404 unknown, 409 illegal, 200 + card. |
| `src/app/cards/page.tsx` | add | The list, with a written empty state. |
| `src/app/cards/issue-dialog.tsx` | add | `Drawer` form → one-time reveal, cleared on close. One `Field` renders a Select or an Input, since the label/error/aria plumbing is identical. |
| `src/app/cards/card-actions.tsx` | add | Freeze and unfreeze via `PATCH` + `router.refresh()`. `—` for a cancelled card. |
| `src/app/cards/[id]/page.tsx` | add | Full record and spend bar, amber past 80%. Created date in the merchant's timezone. |
| `src/app/siteConfig.ts`, `AppSidebar.tsx` | change | A `cards` link and nav row. |
| `src/components/ui/cards/CardStatusBadge.tsx` | add | A separate badge because `active` means something different for a card, and the payments union has no `frozen` or `cancelled`. |

## Decisions the ticket left open

1. **A card settles in its merchant's currency.** Each merchant has exactly one, and the money rule forbids summing across currencies, so a GBP card on a USD merchant puts two currencies on one relationship. `parseIssueRequest` takes merchants rather than ids so it can enforce this; the form offers only the accepted currency rather than inviting a 400.
2. **Issuing is idempotent** on a caller-supplied `requestId`. A replay returns the same card with `200` and **no number** — otherwise a retry becomes a second read of a one-time secret.
3. **`frozen → frozen` is refused with 409**, so a double click is reported rather than looking like it worked twice.
4. **Cancelling is server-side only.** The transition is implemented and tested, but no UI control ships: it is irreversible and deserves a confirmation design this ticket did not ask for.
5. **No filtering, sorting or pagination** on `/cards`. Twelve to twenty cards a week does not need it, and a second filter path would break ORG-6 for no benefit.
6. **Row actions name their card** in an `aria-label`: across twenty rows "Freeze" alone does not say which, and the row supplies that context visually and nowhere else.
7. **The spend bar's width is an inline `style`**, which `components.md:10` otherwise forbids. A computed percentage is the one thing the Tailwind JIT cannot see, and there is no `ProgressBar` primitive; the repo's own `Drawer.tsx:59` and `BarChart.tsx:399` do the same.

## Plan

Types and store slice → `src/lib` rules with their tests → `src/data/cards.ts` with its tests → route handlers, proven by `fetch` before any UI → list, detail, dialog, actions → nav → browser verification → `/ship-ready` → `/pr` → push.

## Verification

| Criterion | How it is proven |
| --- | --- |
| CORE-1 issue a card | Playwright fills the drawer and submits; the row appears |
| CORE-2/3 list and detail | Header and cells asserted; `role="progressbar"` with `aria-valuenow` |
| CORE-4 generated numbers | 500 samples: 16 digits, `4242`, Luhn-valid; extremes via injected `random` |
| CORE-5 reveal once | The 16 digits absent from the DOM after close, and from both GET payloads |
| CORE-6 validation | `fetch` bypassing the UI: each rejection returns 400 and names its field |
| RULE-3 state machine | Every edge over HTTP, including 409 on a terminal card |
| Stretch | Freeze with no document request; amber at 87%; category shown; empty and error states |

## Risks

- **The store lives on `globalThis`.** Adding a slice while the server runs leaves the old shape cached and yields a 500 — restart, do not hot-reload. This cost real time once.
- **`crypto.randomUUID` needs a secure context** (fine on localhost and HTTPS). Seeds are pinned to `GENERATED_AT` so the amber case is reproducible; wall-clock time made them drift between runs.

## Out of scope

Persistence (NWP-203), auth, real issuer calls, editing a limit after issue (NWP-202). Also **not** fixed here: `src/data/metrics.ts:25` buckets with `toLocaleDateString` in server local time while its keys come from `lastUtcDays`, and `:31` accumulates money as floats — against ORG-1/ORG-4, and the subject of NWP-102, so this ticket leaves it alone.

## Open questions

- Should a cancelled card stay in the default list, or move behind a filter once there are hundreds?
- Does ops need a per-card spend feed, or is the limit enough until authorisations exist?
