# SPEC · NWP-201 — Issue virtual cards from the console

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-201-issue-cards.md`

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** Andre Vianna
**Status:** draft

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand. It takes hours, happens twelve to twenty times a week, and last month two cards went out with the wrong spend limit because the request lived in a Slack thread (`docs/tickets/NWP-201.md:17`). Marcus wants issuing in the console today.

## Current state

There is **no card code at all**. Every card concept in this ticket is new.

- `src/data/types.ts:1-84` — `Currency`, `Merchant`, `Payment`, `Refund`, `Dispute`, `Payout`, `PaymentFilters`. No `Card`, no `CardStatus`.
- `src/data/store.ts:16-22` — the `Store` interface has `merchants`, `payments`, `refunds`, `disputes`, `payouts`. No `cards` slice. Held on `globalThis` (`:34`) so dev-server reloads keep writes.
- `src/data/merchants.ts:7-88` — ten merchants, each with `id`, `name`, `country`, `timezone`, `currency`, `riskTier`. **No category field**, so the category lock belongs on the card, not the merchant.
- `src/lib/money.ts:15` — `formatMoney(minorUnits, currency)` is the one formatter. `:46` `parseAmountToMinorUnits` already converts a user-typed `"250"` or `"250.00"` to minor units and returns `null` on anything else — this is the boundary parser the form needs, and it already exists.
- `src/app/siteConfig.ts:5-10` — `baseLinks` lists overview, payments, disputes, payouts. No cards.
- `src/components/ui/navigation/AppSidebar.tsx:26-52` — a `navigation` tuple driven by `siteConfig.baseLinks`; a new route needs a row here.
- `src/components/ui/payments/StatusBadge.tsx` — the badge idiom: `LABELS`, `DOTS`, `VARIANTS` records keyed by a status union, rendering `Badge` with a dot. Cards need the same shape for their own statuses.
- `src/app/payments/[id]/page.tsx` — the detail-page idiom: back link, `notFound()` on a miss, an `<h1>` with the money, `Divider`, then a `<dl>` grid.
- `src/components/` — `Drawer` (the only `@radix-ui/react-dialog` wrapper), `Button`, `Input`, `Select`, `Badge`, `Divider`, `Table`. **No Dialog, no Checkbox, no RadioGroup, no progress bar.**
- `vitest.config.ts:13-14` — node environment over `src/**/*.test.ts`. Unit tests on pure modules work; `.tsx` does not load.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units. A `$250.00` limit is `25000`. Never a float, never a string with a dollar sign. Format once, at the edge." | NWP-201 rule 1 (`docs/tickets/NWP-201.md:60`); ORG-1, ORG-2 (`docs/ORG-STANDARDS.md:8-12`) | A limit stored as `250.00` drifts, and two cards already went out with wrong limits |
| "Never persist or display a full card number after creation. Store the last four and the generated number's reference. The reveal is a one-time response, not a field you can re-read." | NWP-201 rule 2 (`:61`); `.claude/rules/cards.md:12` | A full PAN in the store is readable from every list and detail payload forever |
| "Status is a state machine. `active → frozen → active`, and either can go to `cancelled`. `cancelled` is terminal" | NWP-201 rule 3 (`:62`); `cards.md:14` | A cancelled card comes back to life |
| "Generate on the server. A card number produced in the browser is a bug." | `cards.md:11` | The client picks its own PAN |
| "Every generated number starts `4242` and carries a valid Luhn check digit. Nothing here may resemble a real PAN, ever, including in tests and fixtures." | NWP-201 rule 4 (`:63`); `cards.md:10` | Test data resembles a real card |
| "Anything from a client — column names, currencies, limits, statuses — is checked against an allowlist before it reaches a query, a filename, or the store. Client-side checks are UX, never enforcement." | ORG-7 (`docs/ORG-STANDARDS.md:27-30`); `.claude/rules/api-routes.md:8` | A hand-rolled POST sets a £50m limit on a merchant that does not exist |
| "Store and bucket in UTC… Convert only at display" | ORG-4, ORG-5 (`docs/ORG-STANDARDS.md:18-21`) | Created dates land on the wrong day |
| "Dialogs and forms must be operable. Every input has a label, the dialog has an accessible name, focus moves into it and returns on close, Escape closes it." | `.claude/rules/components.md:11` | The issue form is unusable by keyboard |

## Approach

Cards are a new entity, so they get their own pair of modules rather than being wedged into the payments builder: `src/lib/cards.ts` holds the pure logic (number generation, masking, the transition table, and input validation) and `src/data/cards.ts` holds the store access (list, lookup, issue, transition). That keeps `src/data/queries.ts` as the one *payment* query builder, which is what ORG-6 actually protects. The full number exists only as the return value of the issue call and the body of the creation response — the `Card` record has no field for it, so masking everywhere else is guaranteed by the type rather than by discipline. Validation lives in `src/lib/cards.ts` as a pure parse returning either a value or field errors, so the route is a thin shell and the rules are unit-testable without HTTP.

**Considered and rejected:** storing the generated number on the card and filtering it out of responses. It reads simpler and it is how the leak happens — one new endpoint, one `console.log`, one spread of the record, and the PAN is out. A record with nowhere to put it cannot leak it. Also rejected: putting the category on `Merchant`. The ticket calls it a *card* category lock, merchants have no such field, and adding one would change seed data the rules forbid editing.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | change | `CardStatus` (`active`/`frozen`/`cancelled`), `CardCategory`, and `Card`: `id`, `nickname`, `merchantId`, `spendLimit` and `spent` in minor units, `currency`, `last4`, `reference`, `category`, `status`, `createdAt`. **No field for the full number.** |
| `src/lib/cards.ts` | add | Pure card logic. `luhnCheckDigit` and `isLuhnValid`; `generateCardNumber` returning a 16-digit string on the `4242` BIN with a valid check digit; `maskedNumber(last4)` → `•••• 4242`; `CARD_TRANSITIONS` plus `canTransition(from, to)`; `parseIssueRequest(body, merchantIds)` returning either a validated value or per-field errors. Allowlists currency against `USD`/`EUR`/`GBP`, merchant against the real merchant ids, limit to an integer in `1..5_000_000`. |
| `src/lib/cards.test.ts` | add | Unit tests beside the code: the generator's BIN, length and Luhn validity over many iterations; `isLuhnValid` against the known-good `4242424242424242`; every legal and illegal transition including `cancelled` as terminal; each validation rejection. |
| `src/data/cards.ts` | add | Store access. `listCards()` newest first, `cardById(id)`, `issueCard(input)` returning `{ card, number }` where `number` is the only place the full PAN appears, and `transitionCard(id, to)` which guards via `canTransition` on the server. |
| `src/data/store.ts` | change | A `cards: Card[]` slice, seeded by `generate.ts`. |
| `src/data/generate.ts` | change | Seed three cards deterministically through the real generator so the list, the detail page and the spend bar have content: one active well under its limit, one active past 80% (the amber case), one frozen. Numbers come from `generateCardNumber`, and only `last4` and a reference are kept. |
| `src/app/api/cards/route.ts` | add | `POST` issues a card: `parseIssueRequest` → `400` with `{ message, fields }` on failure, else `201` with `{ card, number }`. The one response that carries a full number. |
| `src/app/api/cards/[id]/route.ts` | add | `PATCH` transitions status, allowlisting the target and rejecting an illegal move with `409`. Returns the updated card. Never returns a number. |
| `src/app/cards/page.tsx` | add | `/cards` list: nickname, merchant, masked number, spend limit, status, created date. Written empty state. |
| `src/app/cards/issue-dialog.tsx` | add | Client `Drawer` form: nickname, merchant `Select`, limit `Input`, currency `Select`, optional category. On success it swaps to a one-time reveal panel showing the full number; closing clears it from state. Field errors render from the server response. |
| `src/app/cards/card-actions.tsx` | add | Client freeze/unfreeze via `PATCH` and `router.refresh()`, so the row updates without a full page reload. Hidden for a cancelled card. |
| `src/app/cards/[id]/page.tsx` | add | Detail: the full record plus spend against the limit, with a progress bar that turns amber past 80%. |
| `src/app/siteConfig.ts` | change | A `cards` base link. |
| `src/components/ui/navigation/AppSidebar.tsx` | change | A Cards row in the `navigation` tuple. |
| `src/components/ui/cards/CardStatusBadge.tsx` | add | The badge for card statuses, following the `LABELS`/`DOTS`/`VARIANTS` shape of `ui/payments/StatusBadge.tsx`. |

## Plan

1. **Types and store slice** — done when: `npm run typecheck`-equivalent (`npx tsc --noEmit`) exits 0 with `Card` in the store and nothing else changed.
2. **`src/lib/cards.ts`** — done when: `tsc` exits 0 and the module exports the generator, mask, transition table and validator.
3. **`src/lib/cards.test.ts`** — done when: `npm test` is green and a generated number fails the suite if its BIN or check digit is wrong.
4. **`src/data/cards.ts` + seeds** — done when: `npm test` still green and three seeded cards exist with no full number stored anywhere.
5. **`POST /api/cards`** — done when: `curl` with a valid body returns `201` and a full number; missing merchant, `0`, `-1`, `5000001`, and `JPY` each return `400` naming the field.
6. **`PATCH /api/cards/[id]`** — done when: `curl` freezes then unfreezes a card, cancels it, and a further transition returns `409`.
7. **`/cards` list and `/cards/[id]` detail** — done when: both render for a seeded card and the masked number appears, never a full one.
8. **Issue dialog with one-time reveal** — done when: submitting creates a card, the number shows once, and closing the drawer clears it.
9. **Freeze/unfreeze from the list** — done when: the status badge changes with no full page reload.
10. **Verify in the browser with Playwright** — done when: the form issues a card, the reveal appears once, the list shows `•••• ####`, and the spend bar is amber on the seeded 80%+ card.
11. **`/ship-ready`, then commit** — done when: checks pass and the commit subject starts `NWP-201:`.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Issue a card | `curl POST /api/cards` returns `201`; Playwright submits the form and the new nickname appears in the list |
| Card list at `/cards` | Playwright asserts the row shows nickname, merchant, masked number, limit, status and created date |
| Card detail | Playwright opens a card and asserts the record plus spend-against-limit render |
| Generated numbers, `4242` BIN, valid Luhn | `cards.test.ts`: 500 generated numbers all start `4242`, are 16 digits, and satisfy `isLuhnValid`; the known-good `4242424242424242` validates and a tampered digit does not |
| Reveal once, mask forever | `cards.test.ts` asserts the `Card` type carries no number field; `curl` shows the full number in the `201` body and never in `GET`/`PATCH`; Playwright asserts the reveal appears once and is gone after close, and that the list shows `•••• ` |
| Server-side validation | `curl` each rejection: no merchant, unknown merchant, `0`, `-1`, `5000001`, `JPY`, non-integer — all `400` naming the field; `cards.test.ts` covers the same through `parseIssueRequest` |
| Stretch · freeze/unfreeze | Playwright clicks Freeze and the badge changes without a navigation |
| Stretch · spend progress amber past 80% | Detail page for the seeded 80%+ card shows the amber bar |
| Stretch · category lock | Chosen at issue, shown on the list and detail |
| Stretch · tests | `npm test` summary line |
| Stretch · empty and error states | Written empty state on `/cards`; field errors rendered from the server response |

## Risks

- **A leaked PAN is the one unrecoverable mistake here.** Mitigated structurally: `Card` has no number field, so a leak needs a deliberate new field rather than an oversight.
- **`parseAmountToMinorUnits` accepts only `\d+(\.\d{1,2})?`** (`money.ts:48`), so `"1e5"`, a comma, or a minus sign returns `null`. The form must surface that as a field error rather than sending `NaN`.
- **Seeded cards run the real generator at boot**, so a generator bug shows up as a failed test rather than bad seed data — but it also means seeds differ per process. Nothing asserts a specific seeded number.
- **`router.refresh()` for freeze/unfreeze** re-renders the server component rather than mutating client state. It is not a full page reload, which is what the stretch goal asks, but it is a round trip.

## Out of scope

- Persistence (NWP-203) — no database, no ORM, no migration. Cards live until the dev server restarts.
- Auth, roles, permissions. Real card network calls. Editing a limit after issue (NWP-202).
- The lexicographic amount sort in `queries.ts` and the inert `pageSize` — pre-existing, unrelated to cards.
- `src/data/metrics.ts:25` buckets in server local time rather than UTC. Pre-existing.

## Open questions

- Should a cancelled card stay in the default `/cards` list, or be filtered out? Listing everything is assumed, since ops asks "what happened to that card last Tuesday".
- Is `spent` seeded-only for now? Nothing in scope spends against a card, so the field exists and is displayed but only seed data moves it.
- Should the spend limit be capped per currency? `5_000_000` minor units is £50,000 and $50,000, which are not the same risk. Taken as a flat cap, as written.
