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
  const highest = store.cards.reduce((max, card) => {
    const n = Number(card.id.replace("card_", ""))
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  return `card_${String(highest + 1).padStart(4, "0")}`
}

export function issueCard(input: IssueCardInput): {
  card: Card
  number: string | null
  replayed: boolean
} {
  if (input.requestId) {
    const seen = issuedRequests.get(input.requestId)
    if (seen) {
      const existing = cardById(seen)
      if (existing) return { card: existing, number: null, replayed: true }
    }
  }

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
  if (input.requestId) issuedRequests.set(input.requestId, card.id)
  return { card, number, replayed: false }
}

const issuedRequests = new Map<string, string>()

export type TransitionResult =
  { ok: true; card: Card } | { ok: false; reason: "not_found" | "illegal" }

export function transitionCard(id: string, to: CardStatus): TransitionResult {
  const card = cardById(id)
  if (!card) return { ok: false, reason: "not_found" }
  if (!canTransition(card.status, to)) return { ok: false, reason: "illegal" }

  card.status = to
  return { ok: true, card }
}
