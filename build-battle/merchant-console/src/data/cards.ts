import { cardReference, generateCardNumber } from "@/lib/card-number"
import { IssueCardInput, canTransition } from "@/lib/cards"
import { store } from "./store"
import { Card, CardStatus } from "./types"

export function listCards(): Card[] {
  return [...store.cards].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  )
}

export function cardById(id: string): Card | null {
  return store.cards.find((card) => card.id === id) ?? null
}

function nextCardId(): string {
  const used = store.cards.map((card) => Number(card.id.replace("card_", "")))
  const highest = Math.max(0, ...used.filter(Number.isFinite))
  return `card_${String(highest + 1).padStart(4, "0")}`
}

export function issueCard(input: IssueCardInput): {
  card: Card
  number: string | null
  replayed: boolean
} {
  const seen = input.requestId
    ? store.issuedRequests.get(input.requestId)
    : null
  const existing = seen ? cardById(seen) : null
  if (existing) return { card: existing, number: null, replayed: true }

  const number = generateCardNumber()

  const card: Card = {
    id: nextCardId(),
    nickname: input.nickname,
    merchantId: input.merchantId,
    spendLimit: input.spendLimit,
    spent: 0,
    currency: input.currency,
    last4: number.slice(-4),
    reference: cardReference(),
    category: input.category,
    status: "active",
    createdAt: new Date().toISOString(),
  }

  store.cards.push(card)
  if (input.requestId) store.issuedRequests.set(input.requestId, card.id)
  return { card, number, replayed: false }
}

export type TransitionResult =
  { ok: true; card: Card } | { ok: false; reason: "not_found" | "illegal" }

export function transitionCard(id: string, to: CardStatus): TransitionResult {
  const card = cardById(id)
  if (!card) return { ok: false, reason: "not_found" }
  if (!canTransition(card.status, to)) return { ok: false, reason: "illegal" }

  card.status = to
  return { ok: true, card }
}
