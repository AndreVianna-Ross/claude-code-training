import { Card, CardCategory, CardStatus, Currency } from "@/data/types"

/**
 * Card rules, all pure so they can be tested without HTTP or a store.
 *
 * Numbers are generated HERE, on the server, never in the browser. Every one
 * starts with the 4242 test BIN and carries a valid Luhn check digit, so
 * nothing in this repository can resemble a real PAN.
 */

/** The test BIN. Not optional — see .claude/rules/cards.md. */
export const TEST_BIN = "4242"

const CARD_NUMBER_LENGTH = 16

export const CARD_CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]

export const CARD_CATEGORIES: readonly CardCategory[] = [
  "advertising",
  "software",
  "travel",
  "contractors",
  "utilities",
]

/** A limit above this is refused. Minor units, so this is 50,000.00. */
export const MAX_SPEND_LIMIT = 5_000_000

export const NICKNAME_MAX = 60

/**
 * The Luhn check digit for a partial number, so that appending it makes the
 * whole string satisfy the Luhn checksum.
 */
export function luhnCheckDigit(partial: string): number {
  let sum = 0
  // The check digit will sit at the end, so the rightmost digit of `partial`
  // is in a doubled position.
  let double = true

  for (let i = partial.length - 1; i >= 0; i--) {
    let digit = partial.charCodeAt(i) - 48
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }

  return (10 - (sum % 10)) % 10
}

/** Whether a complete number satisfies the Luhn checksum. */
export function isLuhnValid(number: string): boolean {
  if (!/^\d+$/.test(number)) return false

  let sum = 0
  let double = false

  for (let i = number.length - 1; i >= 0; i--) {
    let digit = number.charCodeAt(i) - 48
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }

  return sum % 10 === 0
}

/**
 * A 16-digit number on the test BIN with a valid check digit.
 *
 * Server-side only. The result is returned to the caller exactly once and is
 * never stored — see the Card type.
 */
export function generateCardNumber(
  random: () => number = Math.random,
): string {
  let body = TEST_BIN
  while (body.length < CARD_NUMBER_LENGTH - 1) {
    body += Math.floor(random() * 10)
  }
  return body + luhnCheckDigit(body)
}

/** How a card's number is shown everywhere except the creation response. */
export function maskedNumber(last4: string): string {
  return `•••• ${last4}`
}

const REFERENCE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
const REFERENCE_LENGTH = 10

/**
 * An opaque handle for a card, drawn independently of its number.
 *
 * It MUST NOT be derived from the number. Deriving it — even from a slice —
 * hands back digits that, with the known 4242 BIN and the stored last four,
 * narrow the PAN to a handful of Luhn-valid candidates. The reference exists
 * to name a card in a support thread, not to encode it.
 */
export function cardReference(random: () => number = Math.random): string {
  let token = ""
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    token += REFERENCE_ALPHABET[Math.floor(random() * REFERENCE_ALPHABET.length)]
  }
  return `ref_${token}`
}

/**
 * The state machine. `cancelled` is terminal, which is why its list is empty
 * rather than absent — an empty list is a rule, a missing key is an oversight.
 */
export const CARD_TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

export function canTransition(from: CardStatus, to: CardStatus): boolean {
  return CARD_TRANSITIONS[from].includes(to)
}

export function isCardStatus(value: unknown): value is CardStatus {
  return value === "active" || value === "frozen" || value === "cancelled"
}

/** What a validated issue request looks like once past the boundary. */
export interface IssueCardInput {
  nickname: string
  merchantId: string
  spendLimit: number
  currency: Currency
  category: CardCategory | null
  /**
   * Caller-supplied key that makes issuing idempotent. A retry — a double
   * click, a flaky connection, an impatient reload — carries the same key and
   * gets the same card back instead of minting a second one.
   */
  requestId: string | null
}

export type FieldErrors = Partial<
  Record<"nickname" | "merchantId" | "spendLimit" | "currency" | "category", string>
>

export type ParseResult =
  | { ok: true; value: IssueCardInput }
  | { ok: false; errors: FieldErrors }

/**
 * The boundary. Everything the client sends is checked against an allowlist
 * before it reaches the store (ORG-7): the merchant against the real ids, the
 * currency against the three we issue in, the limit against an integer range.
 *
 * `spendLimit` must already be MINOR UNITS. The decimal a human typed is
 * converted once, by parseAmountToMinorUnits at the form edge, and a bad
 * string never becomes a number here.
 */
export function parseIssueRequest(
  body: unknown,
  merchants: readonly { id: string; currency: Currency }[],
): ParseResult {
  const errors: FieldErrors = {}
  const input = (body ?? {}) as Record<string, unknown>

  const nickname =
    typeof input.nickname === "string" ? input.nickname.trim() : ""
  if (!nickname) {
    errors.nickname = "Give the card a nickname."
  } else if (nickname.length > NICKNAME_MAX) {
    errors.nickname = `Keep the nickname under ${NICKNAME_MAX} characters.`
  }

  const merchantId =
    typeof input.merchantId === "string" ? input.merchantId : ""
  const merchant = merchants.find((entry) => entry.id === merchantId) ?? null
  if (!merchantId) {
    errors.merchantId = "Choose a merchant."
  } else if (!merchant) {
    errors.merchantId = "That merchant does not exist."
  }

  const spendLimit = input.spendLimit
  if (typeof spendLimit !== "number" || !Number.isInteger(spendLimit)) {
    errors.spendLimit = "Enter a limit as a whole number of minor units."
  } else if (spendLimit <= 0) {
    errors.spendLimit = "The limit must be more than zero."
  } else if (spendLimit > MAX_SPEND_LIMIT) {
    errors.spendLimit = "The limit cannot exceed 5,000,000 minor units."
  }

  const currency = input.currency
  if (!CARD_CURRENCIES.includes(currency as Currency)) {
    errors.currency = "Cards are issued in USD, EUR or GBP."
  } else if (merchant && currency !== merchant.currency) {
    // A card settles where its merchant settles. Allowing a GBP card against
    // a USD merchant would mean one relationship carrying two currencies, and
    // the money rule forbids summing across currencies without converting.
    errors.currency = `That merchant settles in ${merchant.currency}.`
  }

  // Absent is fine; present-but-unknown is not.
  let category: CardCategory | null = null
  if (
    input.category !== undefined &&
    input.category !== null &&
    input.category !== ""
  ) {
    if (CARD_CATEGORIES.includes(input.category as CardCategory)) {
      category = input.category as CardCategory
    } else {
      errors.category = "That category is not one we lock cards to."
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      nickname,
      merchantId,
      spendLimit: spendLimit as number,
      currency: currency as Currency,
      category,
      requestId:
        typeof input.requestId === "string" && input.requestId.trim()
          ? input.requestId.trim()
          : null,
    },
  }
}

/** Spend against the limit, as a whole percentage, clamped to 0..100. */
export function spendPercent(card: Pick<Card, "spent" | "spendLimit">): number {
  if (card.spendLimit <= 0) return 0
  return Math.min(100, Math.round((card.spent / card.spendLimit) * 100))
}

/** Past this, the progress bar warns. */
export const SPEND_WARN_PERCENT = 80

/**
 * Compared as integers rather than against spendPercent, which rounds: 80.004%
 * rounds to 80 and would read as "not past 80" when it is. Cross-multiplying
 * keeps both sides whole minor units, so no float touches an amount.
 */
export function isSpendWarning(
  card: Pick<Card, "spent" | "spendLimit">,
): boolean {
  if (card.spendLimit <= 0) return false
  return card.spent * 100 > card.spendLimit * SPEND_WARN_PERCENT
}

export const CARD_CATEGORY_LABELS: Record<CardCategory, string> = {
  advertising: "Advertising",
  software: "Software",
  travel: "Travel",
  contractors: "Contractors",
  utilities: "Utilities",
}

/** Kept narrow on purpose: a card's own statuses, not any status. */
export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  active: "Active",
  frozen: "Frozen",
  cancelled: "Cancelled",
}
