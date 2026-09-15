# SPEC · NWP-201 — Issue virtual cards from the console

> Written before any code, then kept current as the build taught us things.
> Load it as context when you build: `@docs/specs/NWP-201-issue-cards.md`

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** Andre Vianna
**Status:** built

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand. It takes hours, happens twelve to twenty times a week, and last month two cards went out with the wrong spend limit because the request lived in a Slack thread (`docs/tickets/NWP-201.md:17`). Marcus wants issuing in the console.

## Current state

At the start of this ticket there was no card code: no `Card`, no `CardStatus`, no `cards` slice, no `/cards` route. What already existed and had to be reused:

- `src/data/types.ts:121` — `PaymentFilters`; the card types were added by this ticket at `:74` onward.
- `src/data/store.ts:16` — the `Store` interface, held on `globalThis` (`:34`) so dev-server reloads keep writes. **A new slice needs a server restart, not a hot reload.**
- `src/data/merchants.ts:7` — ten merchants with `id`, `name`, `country`, `timezone`, `currency`, `riskTier`. **No category field**, so the category lock belongs on the card. Each has exactly one currency, which is what makes the card-currency rule below decidable.
- `src/lib/money.ts:15` — `formatMoney(minorUnits, currency)`, the one formatter. `:46` `parseAmountToMinorUnits` converts a typed `"250.00"` to minor units and returns `null` otherwise: the boundary parser the form needs, already written.
- `src/lib/dates.ts:22` — `formatInZone(iso, timezone)`; `:31` `formatDate`. Display converts; storage does not.
- `src/components/ui/payments/StatusBadge.tsx:5` — the badge idiom: `LABELS`/`DOTS`/`VARIANTS` records keyed by a status union.
- `src/app/payments/[id]/page.tsx` — the detail-page idiom: back link, `notFound()` on a miss, `<h1>`, `Divider`, `<dl>` grid.
- `src/components/` — `Drawer` (the only `@radix-ui/react-dialog` wrapper), `Button`, `Input`, `Select`, `Badge`, `Divider`, `Table`. **No Dialog**, despite `.claude/rules/components.md:9` claiming one; no Checkbox, no progress bar.
- `vitest.config.ts:13` — node environment over `src/**/*.test.ts`. Pure modules test; `.tsx` does not load.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| Money is integer minor units; `$250.00` is `25000`. Format once, at the edge. | NWP-201 rule 1; ORG-1/ORG-2 | A limit stored as `250.00` drifts, and two cards already went out wrong |
| Never persist or display a full number after creation. Keep the last four and a reference. | NWP-201 rule 2; `cards.md:12` | A PAN in the store is readable from every payload forever |
| Status is a state machine: `active ⇄ frozen`, either to `cancelled`, `cancelled` terminal. | NWP-201 rule 3; `cards.md:14` | A cancelled card comes back to life |
| Generate on the server. | `cards.md:11` | The client picks its own PAN |
| Every number starts `4242` with a valid Luhn digit — including in tests and fixtures. | NWP-201 rule 4; `cards.md:10` | Repository data resembles a real card |
| Everything from a client is allowlisted before it reaches the store. | ORG-7; `api-routes.md:8` | A hand-rolled POST sets a £50m limit on a merchant that does not exist |
| Store and bucket in UTC; convert only at display. | ORG-4/ORG-5 | Created dates land on the wrong day |
| Dialogs are operable: labels, accessible name, focus in and back, Escape closes. | `components.md:11` | The issue form is unusable by keyboard |

## Approach

Cards are a new entity, so they get their own pair of modules rather than being wedged into the payments builder: `src/lib/cards.ts` holds pure logic (generation, masking, the transition table, validation) and `src/data/cards.ts` holds store access. That leaves `src/data/queries.ts` as the one *payment* query builder, which is what ORG-6 protects.

The full number exists only as the return value of `issueCard` and the body of the creation response. The `Card` record has **no field for it**, so masking everywhere else follows from the type rather than from discipline. Validation is a pure parse returning a value or per-field errors, so the route is a thin shell and every rule is unit-testable without HTTP.

**Rejected:** storing the number and filtering it out of responses — one new endpoint or one stray spread and the PAN is out; a record with nowhere to put it cannot leak it. **Rejected:** a `reference` derived from the number — with the known `4242` BIN and the stored last four, even a six-digit slice narrows the PAN to a handful of Luhn-valid candidates, so the reference is drawn independently from a digit-free alphabet. **Rejected:** putting the category on `Merchant` — the ticket calls it a card lock, and adding a field would edit seed data the rules protect.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | change | `CardStatus`, `CardCategory`, `Card`, `CardEvent`. Amounts in minor units. **No field for the full number.** |
| `src/lib/cards.ts` | add | `luhnCheckDigit`, `isLuhnValid`, `generateCardNumber` (injectable `random` so extremes are testable), `maskedNumber`, `cardReference`, `CARD_TRANSITIONS` + `canTransition`, `isCardStatus`, `parseIssueRequest(body, merchants)`, `spendPercent`, `isSpendWarning`. |
| `src/lib/cards.test.ts` | add | The generator over 500 samples plus its extremes; the reference sharing nothing with a number; every transition; every validation rejection. |
| `src/data/cards.ts` | add | `listCards()` newest first, `cardById`, `issueCard(input)` → `{ card, number, replayed }`, `transitionCard(id, to)`. |
| `src/data/cards.test.ts` | add | What pure rules cannot reach: idempotent issuing, history appends, list ordering. |
| `src/data/store.ts` | change | A `cards: Card[]` slice. |
| `src/data/generate.ts` | change | Three cards seeded through the real generator, pinned to `GENERATED_AT`: one active, one active past 80% (the amber case), one frozen. Only `last4` and a reference are kept. |
| `src/app/api/cards/route.ts` | add | `GET` masked list. `POST` issues: `400 {message, fields}`, `201 {card, number}`, or `200` with `number: null` on a replay. `cache-control: no-store`. |
| `src/app/api/cards/[id]/route.ts` | add | `GET` one card (404 on a miss). `PATCH` transitions: 400 bad status, 404 unknown, 409 illegal, 200 + card. |
| `src/app/cards/page.tsx` | add | The list. Written empty state. |
| `src/app/cards/issue-dialog.tsx` | add | `Drawer` form → one-time reveal panel, cleared on close. `Field` wraps the label/error markup used five times. |
| `src/app/cards/card-actions.tsx` | add | Freeze, unfreeze and cancel via `PATCH` + `router.refresh()`. Cancel asks first. |
| `src/app/cards/[id]/page.tsx` | add | Full record, spend bar amber past 80%, and the history list in the merchant's timezone. |
| `src/app/siteConfig.ts`, `AppSidebar.tsx` | change | A `cards` base link and a Cards nav row. |
| `src/components/ui/cards/CardStatusBadge.tsx` | add | Card statuses, following the payments badge shape. A separate component because `active` means something different for a card, and the payments union has no `frozen` or `cancelled`. |

## Decisions the ticket left open

1. **A card settles in its merchant's currency.** Each merchant has exactly one, and the money rule forbids summing across currencies, so a GBP card on a USD merchant would put two currencies on one relationship. `parseIssueRequest` takes merchants rather than ids so it can enforce this; the form offers only the accepted currency rather than inviting a 400.
2. **Issuing is idempotent** on a caller-supplied `requestId`. A replay returns the same card with `200` and **no number** — otherwise a retry becomes a second read of a one-time secret.
3. **`frozen → frozen` is refused with 409**, not accepted as a no-op, so a double click is reported rather than looking like it worked twice.
4. **Cancel is in the UI behind a confirm step**, because it is terminal.
5. **No filtering, sorting or pagination** on `/cards`. Twelve to twenty cards a week does not need it, and a second filter path would break ORG-6 for no benefit.

## Plan

1. Types and store slice — `npx tsc --noEmit` exits 0.
2. `src/lib/cards.ts` with its tests — `npm test` green before anything calls it.
3. `src/data/cards.ts` with its tests.
4. Route handlers — verified by `fetch`/curl before any UI exists.
5. List, detail, dialog, actions; nav last.
6. Browser verification, then `/ship-ready`, then `/pr`, then push and open the PR.

## Verification

| Criterion | How it is proven |
| --- | --- |
| CORE-1 issue a card | Playwright fills the drawer and submits; the row appears |
| CORE-2 list | Header row and cells asserted |
| CORE-3 detail | Record plus `role="progressbar"` with `aria-valuenow` |
| CORE-4 generated numbers | 500 samples: 16 digits, `4242`, Luhn-valid; extremes via injected `random` |
| CORE-5 reveal once | The 16 digits are absent from the DOM after close, and from both GET payloads |
| CORE-6 validation | `fetch` bypassing the UI: each rejection returns 400 and names its field |
| RULE-3 state machine | Every edge over HTTP, including 409 on a terminal card |
| Stretch | Freeze with no document request; amber at 87%; category shown; empty and error states |

## Risks

- **The store lives on `globalThis`.** Adding a slice while the server is running leaves the old shape cached and yields a 500 — restart, do not hot-reload. This cost real time once.
- **`crypto.randomUUID` needs a secure context.** Fine on localhost and HTTPS.
- **Seeds are pinned to `GENERATED_AT`**, so the amber case is reproducible; using wall-clock time made seeded dates drift between runs.

## Out of scope

Persistence (NWP-203), auth, real issuer calls, editing a limit after issue (NWP-202). Also **not** fixed here: `src/data/metrics.ts:25` buckets with `toLocaleDateString` in server local time while its keys come from `lastUtcDays`, and `:31` accumulates money as floats — both against ORG-1/ORG-4 — that is NWP-102's subject, and this ticket leaves it alone.

## Open questions

- Should a cancelled card stay in the default list, or move behind a filter once there are hundreds?
- Does ops need a per-card spend feed, or is the limit enough until authorisations exist?
