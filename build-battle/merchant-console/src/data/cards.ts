import {
  IssueCardInput,
  canTransition,
  cardReference,
  generateCardNumber,
} from "@/lib/cards"
import { store } from "./store"
import { Card, CardStatus } from "./types"

/**
 * Store access for cards. Kept separate from queries.ts, which is the one
 * PAYMENT query builder — cards are a different entity, not a second filter
 * path over the same rows.
 */

/** Newest first: ops cares about what was just issued. */
export function listCards(): Card[] {
  return [...store.cards].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function cardById(id: string): Card | null {
  return store.cards.find((card) => card.id === id) ?? null
}

function nextCardId(): string {
  // Highest existing suffix + 1, so a card issued after a seed cannot collide
  // with one that was deleted-and-reissued in the same process.
  const highest = store.cards.reduce((max, card) => {
    const n = Number(card.id.replace("card_", ""))
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  return `card_${String(highest + 1).padStart(4, "0")}`
}

/**
 * Issue a card.
 *
 * The generated number is returned to the caller and NOT stored: the Card
 * record has no field for it. This is the only function in the codebase that
 * has the full number in hand, and it hands it over exactly once.
 */
export function issueCard(input: IssueCardInput): {
  card: Card
  number: string
} {
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
  return { card, number }
}

export type TransitionResult =
  | { ok: true; card: Card }
  | { ok: false; reason: "not_found" | "illegal" }

/**
 * Move a card's status, guarded on the server (cards.md) rather than only in
 * the UI. An illegal move is reported, never silently applied.
 */
export function transitionCard(
  id: string,
  to: CardStatus,
): TransitionResult {
  const card = cardById(id)
  if (!card) return { ok: false, reason: "not_found" }
  if (!canTransition(card.status, to)) return { ok: false, reason: "illegal" }

  card.status = to
  return { ok: true, card }
}
