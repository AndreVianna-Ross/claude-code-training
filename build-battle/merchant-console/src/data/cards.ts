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

/**
 * Newest first: ops cares about what was just issued.
 *
 * Two cards issued in the same millisecond share a createdAt, so id breaks the
 * tie. Ids are zero-padded and monotonic, which makes comparing them as
 * strings the same as comparing the order they were issued in.
 */
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
  number: string | null
  replayed: boolean
} {
  // A retry carrying a key we have already honoured returns that card rather
  // than minting a second one. `number` is null on a replay: the reveal is
  // genuinely once, so a replayed request cannot be used to read it again.
  if (input.requestId) {
    const seen = issuedRequests.get(input.requestId)
    if (seen) {
      const existing = cardById(seen)
      if (existing) return { card: existing, number: null, replayed: true }
    }
  }

  const number = generateCardNumber()
  const at = new Date().toISOString()

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
    createdAt: at,
    history: [{ at, action: "issued" }],
  }

  store.cards.push(card)
  if (input.requestId) issuedRequests.set(input.requestId, card.id)
  return { card, number, replayed: false }
}

/**
 * Idempotency keys we have already honoured, mapped to the card they made.
 *
 * In memory like the rest of the store, and cleared with it on restart —
 * persistence is NWP-203.
 */
const issuedRequests = new Map<string, string>()

export type TransitionResult =
  { ok: true; card: Card } | { ok: false; reason: "not_found" | "illegal" }

/**
 * Move a card's status, guarded on the server (cards.md) rather than only in
 * the UI. An illegal move is reported, never silently applied.
 */
export function transitionCard(id: string, to: CardStatus): TransitionResult {
  const card = cardById(id)
  if (!card) return { ok: false, reason: "not_found" }
  if (!canTransition(card.status, to)) return { ok: false, reason: "illegal" }

  card.history.push({
    at: new Date().toISOString(),
    action: to,
    from: card.status,
  })
  card.status = to
  return { ok: true, card }
}
