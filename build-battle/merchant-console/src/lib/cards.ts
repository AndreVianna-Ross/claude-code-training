import { Card, CardCategory, CardStatus, Currency } from "@/data/types"

export const CARD_CURRENCIES: readonly Currency[] = ["USD", "EUR", "GBP"]
export const CARD_CATEGORY_LABELS: Record<CardCategory, string> = {
  advertising: "Advertising",
  software: "Software",
  travel: "Travel",
  contractors: "Contractors",
  utilities: "Utilities",
}

export const CARD_CATEGORIES = Object.keys(
  CARD_CATEGORY_LABELS,
) as readonly CardCategory[]

export const MAX_SPEND_LIMIT = 5_000_000
export const NICKNAME_MAX = 60

export const CARD_TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

export const canTransition = (from: CardStatus, to: CardStatus): boolean =>
  CARD_TRANSITIONS[from].includes(to)

export const isCardStatus = (value: unknown): value is CardStatus =>
  typeof value === "string" && Object.hasOwn(CARD_TRANSITIONS, value)

export interface IssueCardInput {
  nickname: string
  merchantId: string
  spendLimit: number
  currency: Currency
  category: CardCategory | null
  requestId: string | null
}

export type FieldErrors = Partial<
  Record<"nickname" | "merchantId" | "spendLimit" | "currency" | "category", string>
>

export type ParseResult =
  | { ok: true; value: IssueCardInput }
  | { ok: false; errors: FieldErrors }

const asString = (value: unknown) => (typeof value === "string" ? value : "")
const asNumber = (value: unknown) => (typeof value === "number" ? value : NaN)

export function parseIssueRequest(
  body: unknown,
  merchants: readonly { id: string; currency: Currency }[],
): ParseResult {
  const errors: FieldErrors = {}
  const input = (body ?? {}) as Record<string, unknown>

  const nickname = asString(input.nickname).trim()
  if (!nickname) {
    errors.nickname = "Give the card a nickname."
  } else if (nickname.length > NICKNAME_MAX) {
    errors.nickname = `Keep the nickname under ${NICKNAME_MAX} characters.`
  }

  const merchantId = asString(input.merchantId)
  const merchant = merchants.find((entry) => entry.id === merchantId) ?? null
  if (!merchantId) {
    errors.merchantId = "Choose a merchant."
  } else if (!merchant) {
    errors.merchantId = "That merchant does not exist."
  }

  const spendLimit = asNumber(input.spendLimit)
  if (!Number.isInteger(spendLimit)) {
    errors.spendLimit = "Enter a limit as a whole number of minor units."
  } else if (spendLimit <= 0) {
    errors.spendLimit = "The limit must be more than zero."
  } else if (spendLimit > MAX_SPEND_LIMIT) {
    errors.spendLimit = "The limit cannot exceed 5,000,000 minor units."
  }

  const currency = CARD_CURRENCIES.find((code) => code === input.currency)
  if (!currency) {
    errors.currency = "Cards are issued in USD, EUR or GBP."
  } else if (merchant && currency !== merchant.currency) {
    errors.currency = `That merchant settles in ${merchant.currency}.`
  }

  const given = input.category
  const category = CARD_CATEGORIES.find((entry) => entry === given) ?? null
  if (given != null && given !== "" && !category) {
    errors.category = "That category is not one we lock cards to."
  }

  if (Object.keys(errors).length > 0 || !currency) return { ok: false, errors }

  const requestId = asString(input.requestId).trim() || null

  return {
    ok: true,
    value: { nickname, merchantId, spendLimit, currency, category, requestId },
  }
}

export function spendPercent(card: Pick<Card, "spent" | "spendLimit">): number {
  if (card.spendLimit <= 0) return 0
  return Math.min(100, Math.round((card.spent / card.spendLimit) * 100))
}

export const SPEND_WARN_PERCENT = 80

export const isSpendWarning = (
  card: Pick<Card, "spent" | "spendLimit">,
): boolean =>
  card.spendLimit > 0 &&
  card.spent * 100 > card.spendLimit * SPEND_WARN_PERCENT

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  active: "Active",
  frozen: "Frozen",
  cancelled: "Cancelled",
}
