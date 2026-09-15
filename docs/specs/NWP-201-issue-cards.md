# SPEC · NWP-201 — Issue virtual cards from the console

**Ticket:** [NWP-201](../tickets/NWP-201.md) · **Author:** Andre Vianna · **Status:** built

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand. It takes hours, happens twelve to twenty times a week, and last month two cards went out with the wrong spend limit because the request lived in a Slack thread (`docs/tickets/NWP-201.md:16`).

## Current state

No card code existed: no `Card`, no `CardStatus`, no `cards` slice, no `/cards` route. What did exist and had to be reused:

- `src/lib/money.ts:15` `formatMoney(minorUnits, currency)`, the one formatter; `:46` `parseAmountToMinorUnits` converts a typed `"250.00"` and returns `null` otherwise — the boundary parser the form needs, already written.
- `src/lib/dates.ts:22` `formatInZone(iso, timezone)`. Display converts; storage does not.
- `src/data/store.ts:16` the `Store` interface, held on `globalThis` (`:44`) so reloads keep writes. **A new slice needs a server restart, not a hot reload.**
- `src/data/merchants.ts:7` ten merchants, each with exactly one currency and **no category field** — so the category lock belongs on the card, and the card-currency rule is decidable.
- `src/components/ui/payments/StatusBadge.tsx:10` one badge keyed by a status union; `src/app/payments/[id]/page.tsx` the detail-page idiom: back link, `notFound()`, `<h1>`, `Divider`, `<dl>`.
- `src/components/` has `Drawer` (the only `@radix-ui/react-dialog` wrapper), `Button`, `Input`, `Select`, `Badge`, `Table`. **No Dialog**, despite `.claude/rules/components.md:9` claiming one; no progress bar. `vitest.config.ts:13` runs a node environment over `src/**/*.test.ts` — pure modules, the data layer and the route handlers all test; `.tsx` does not load.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| Money is integer minor units; `$250.00` is `25000`. Format once, at the edge. | ticket rule 1; `money.md:10`, `:16` | A limit stored as `250.00` drifts; two cards already went out wrong |
| Never persist or display a full number after creation — last four and a reference only. | ticket rule 2; `cards.md:12`, `api-routes.md:12` | A PAN in the store is readable from every payload forever |
| `active ⇄ frozen`, either to `cancelled`, `cancelled` terminal, guarded server-side. | ticket rule 3; `cards.md:14` | A cancelled card comes back to life |
| Generate on the server, `4242` BIN, valid Luhn digit, fixtures included. | ticket rule 4; `cards.md:10`, `:11` | The client picks its own PAN, or repository data resembles a real card |
| Allowlist everything from a client before it reaches the store; reject early; one error shape. | ORG-7; `api-routes.md:8`, `:11`, `:13` | A hand-rolled POST sets a £50m limit on a merchant that does not exist |
| Store and bucket in UTC; convert only at display. | ORG-4/ORG-5 | Created dates land on the wrong day |
| Dialogs are operable: labels, accessible name, focus in and back, Escape closes. No inline `style`. | `components.md:10`, `:11` | The issue form is unusable by keyboard; the spend bar cannot use a computed width |

## Approach

Cards are a new entity, so they get their own modules rather than being wedged into the payments builder: `src/lib/card-number.ts` for PAN generation and masking, `src/lib/cards.ts` for the remaining pure rules, `src/data/cards.ts` for store access. `src/data/queries.ts` stays the one *payment* query builder, which is what ORG-6 protects.

The full number exists only as the return value of `issueCard` and the body of the creation response. The `Card` record has **no field for it**, so masking follows from the type rather than from discipline. Validation is a pure parse returning a value or per-field errors, so the route is a thin shell and every rule is testable without HTTP.

**Rejected:** storing the number and filtering it out of responses — one stray spread and the PAN is out. **Rejected:** deriving `reference` from the number — with the known `4242` BIN and the stored last four, even a slice narrows the PAN to a handful of Luhn-valid candidates, so it is drawn independently; its alphabet carries `2-9` minus the confusable `0`, `1`, `i`, `l`, `o`, because the property that matters is independence, not the absence of digits. **Rejected:** the category on `Merchant` — the ticket calls it a card lock, and adding a field would edit protected seed data. **Rejected:** a cards-only badge component — card statuses join the existing union, since no status name collides.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | change | `CardStatus`, `CardCategory` (a closed five-value vocabulary), `Card`. Minor units. **No field for the full number.** |
| `src/lib/card-number.ts` | add | The only module that ever holds a full PAN, so it stays small: `generateCardNumber` (injectable `random`), `luhnCheckDigit`, `isLuhnValid`, `maskedNumber`, `cardReference`, `TEST_BIN`. |
| `src/lib/cards.ts` | add | `CARD_TRANSITIONS` + `canTransition`, `isCardStatus`, `parseIssueRequest(body, merchants)`, `spendPercent`, `isSpendWarning`, the allowlists with their label maps, and the limits: `MAX_SPEND_LIMIT` 5,000,000, `NICKNAME_MAX` 60, `SPEND_WARN_PERCENT` 80. |
| `src/data/cards.ts` | add | `listCards()` newest first with an id tie-break (two cards can share a millisecond), `cardById`, `issueCard` → `{ card, number, replayed }`, `transitionCard`. |
| `src/data/store.ts`, `src/data/generate.ts` | change | A `cards` slice and an `issuedRequests` index — both on the store, so a reload keeps them — plus three cards seeded through the real generator pinned to `GENERATED_AT`: one active, one past 80% (the amber case), one frozen. |
| `src/app/api/cards/route.ts` | add | `GET` masked list. `POST`: `400 {message, fields}`, `201 {card, number, replayed}`, or `200` with `number: null` on a replay. `cache-control: no-store` on every response. |
| `src/app/api/cards/[id]/route.ts` | add | `GET` one card (404 on a miss). `PATCH`: 400 bad status, 404 unknown, 409 illegal, 200 + card. |
| `src/app/cards/page.tsx`, `issue-dialog.tsx`, `card-actions.tsx`, `[id]/page.tsx` | add | List with a written empty state; `Drawer` form → one-time reveal cleared on close, where one `Field` renders a Select or an Input since the label/error/aria plumbing is identical and a replay shows the mask rather than a second PAN; freeze and unfreeze via `PATCH` + `router.refresh()`, `—` for a cancelled card; full record and spend bar, amber past 80%, created date in the merchant's timezone. |
| the four `*.test.ts` files beside them | add | Listed in Verification below. |
| `src/app/siteConfig.ts`, `AppSidebar.tsx` | change | A `cards` link and nav row. |
| `src/components/ui/payments/StatusBadge.tsx` | change | Card statuses join the existing badge union. |
| `.github/workflows/merchant-console-ci.yml` | add | Not asked for by the ticket. `tsc`, `next lint` and the suite on every push, so the claims below are checked by something other than me. |

## Decisions the ticket left open

1. **A card settles in its merchant's currency.** Each merchant has exactly one, and the money rule forbids summing across currencies, so a GBP card on a USD merchant puts two currencies on one relationship. `parseIssueRequest` takes merchants rather than ids so it can enforce this; the form offers only the accepted currency rather than inviting a 400.
2. **Issuing is idempotent** on a caller-supplied `requestId`. A replay returns the same card with `200`, `replayed: true` and **no number** — otherwise a retry becomes a second read of a one-time secret. The index lives on the store beside `cards`, so a dev reload cannot resurrect a spent key. `requestId` itself is not validated: a non-string coerces to absent, forfeiting idempotency rather than failing the request, because the key is a caller convenience and not a rule the server enforces.
3. **`frozen → frozen` is refused with 409**, so a double click is reported rather than looking like it worked twice.
4. **Cancelling is server-side only.** The transition is implemented and tested over HTTP, but no UI control ships: it is irreversible and deserves a confirmation design this ticket did not ask for.
5. **No filtering, sorting or pagination** on `/cards`. Twelve to twenty cards a week does not need it, and a second filter path would break ORG-6 for no benefit.
6. **Row actions name their card** in an `aria-label`: across twenty rows "Freeze" alone does not say which, and the row supplies that context visually and nowhere else.
7. **The spend bar's width is a literal Tailwind class, not an inline `style`.** `components.md:10` forbids inline styles, and a computed percentage is the one thing the JIT cannot see — so the bar picks from a 21-entry table of literal `w-[n%]` classes at 5% steps. `spendPercent` is a whole number clamped at 100, and the caption and `aria-valuenow` carry that same rounded figure; an over-limit card therefore reads "100%", a known limit of this ticket rather than a hidden one.
8. **A nickname is required and capped at 60 characters, and a limit must be whole minor units.** The ticket names neither. A card with no nickname is unidentifiable in a list that shows no PAN, and a fractional minor unit is a money-rule violation arriving as valid JSON, so both are rejected as 400s beside the rules the ticket does name. **The category lock is optional** — absent, `null` and `""` all store `null` — because the ticket makes the lock a stretch goal, not a requirement.

## Plan

Types and store slice → `src/lib` rules with their tests → `src/data/cards.ts` with its tests → route handlers with their tests → list, detail, dialog, actions → nav → browser verification → `/ship-ready` → `/pr` → push.

## Verification

102 tests, `npm test`. Per criterion:

| Criterion | How it is proven |
| --- | --- |
| CORE-4 generated numbers; Luhn on the test BIN | `card-number.test.ts`: 500 samples asserted 16 digits, `4242`-prefixed and Luhn-valid, plus both extremes of `random` by injection, and a reference proven independent of the number by two seeded tests |
| CORE-5 reveal once | `data/cards.test.ts`: `issueCard`'s record asserted not to contain the number. `api/cards/route.test.ts`: `GET` carries no `number` key at all |
| CORE-6 server-side validation | `cards.test.ts` a row per rejection through the pure parser; `api/cards/route.test.ts` the same rejections **over HTTP**, each a 400 naming its field, plus a non-JSON body in the same error shape |
| RULE-3 state machine | `data/cards.test.ts` against the real store, and `api/cards/[id]/route.test.ts` walks every legal edge **over HTTP** — `frozen → frozen` 409, `cancelled` terminal 409, bad status 400, unknown card 404 |
| Idempotency | `api/cards/route.test.ts`: a replayed `requestId` returns 200, `replayed: true`, `number: null`, the same card id, and adds no second card |
| CORE-1/2/3 issue, list, detail; stretch states | **By hand in the browser:** issue → the row appears → detail → freeze and unfreeze, plus the empty and error states. No automated test drives the UI, because `vitest.config.ts:13` is a node environment and no `.tsx` loads |
| Every check | `tsc --noEmit`, `next lint`, `vitest run` on every push, via CI |

## Risks

- **The store lives on `globalThis`.** Adding a slice while the server runs leaves the old shape cached and yields a 500 — restart, do not hot-reload. This cost real time once.
- **`crypto.randomUUID` needs a secure context** (fine on localhost and HTTPS). Seeds are pinned to `GENERATED_AT` so the amber case is reproducible; wall-clock time made them drift between runs.

## Out of scope

Persistence (NWP-203), auth, real issuer calls, editing a limit after issue (NWP-202). Also **not** fixed here: `src/data/metrics.ts:25` buckets with `toLocaleDateString` in server local time while its keys come from `lastUtcDays`, and `:31` accumulates money as floats — against ORG-1/ORG-4, and the subject of NWP-102, so this ticket leaves it alone.

## Open questions

- Should a cancelled card stay in the default list, or move behind a filter once there are hundreds?
- Does ops need a per-card spend feed, or is the limit enough until authorisations exist?
