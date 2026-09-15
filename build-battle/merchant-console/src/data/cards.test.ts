import { beforeEach, describe, expect, it } from "vitest"
import { cardById, issueCard, listCards, transitionCard } from "./cards"
import { store } from "./store"

/**
 * Store-level behaviour: the parts that pure rules cannot cover because they
 * depend on what is already in the store — idempotent issuing and the audit
 * trail. Runs against the real seeded store, so it also proves the seeds are
 * shaped the way the pages expect.
 */

const request = {
  nickname: "Ad spend",
  merchantId: "mch_01",
  spendLimit: 25_000,
  currency: "USD" as const,
  category: null,
  requestId: null,
}

let before: number

beforeEach(() => {
  before = store.cards.length
})

describe("issueCard", () => {
  it("returns the number exactly once and never stores it", () => {
    const { card, number, replayed } = issueCard({ ...request })

    expect(replayed).toBe(false)
    expect(number).toMatch(/^\d{16}$/)
    expect(card.last4).toBe(number!.slice(-4))
    // The record has no field for the number, so it cannot be read back.
    expect(JSON.stringify(card)).not.toContain(number!)
    expect(cardById(card.id)).toBe(card)
  })

  it("starts a card active and unspent", () => {
    const { card } = issueCard({ ...request })

    expect(card.status).toBe("active")
    expect(card.spent).toBe(0)
  })

  it("mints one card per request id, however many times it is retried", () => {
    const first = issueCard({ ...request, requestId: "retry-me" })
    const second = issueCard({ ...request, requestId: "retry-me" })
    const third = issueCard({ ...request, requestId: "retry-me" })

    expect(second.card.id).toBe(first.card.id)
    expect(third.card.id).toBe(first.card.id)
    expect(store.cards.length).toBe(before + 1)

    // A replay carries no number: otherwise a retry is a second read of a
    // one-time secret.
    expect(first.number).toMatch(/^\d{16}$/)
    expect(second.replayed).toBe(true)
    expect(second.number).toBeNull()
  })

  it("treats a different key, or no key, as a different card", () => {
    issueCard({ ...request, requestId: "key-a" })
    issueCard({ ...request, requestId: "key-b" })
    issueCard({ ...request })
    issueCard({ ...request })

    expect(store.cards.length).toBe(before + 4)
  })

  it("gives every card an id no existing card holds", () => {
    const { card } = issueCard({ ...request })
    const ids = store.cards.map((entry) => entry.id)

    expect(card.id).toMatch(/^card_\d{4}$/)
    expect(ids.filter((id) => id === card.id)).toHaveLength(1)
  })
})

describe("transitionCard", () => {
  it("moves a card both ways, and seals it once cancelled", () => {
    const { card } = issueCard({ ...request })

    expect(transitionCard(card.id, "frozen").ok).toBe(true)
    expect(transitionCard(card.id, "active").ok).toBe(true)
    expect(transitionCard(card.id, "cancelled").ok).toBe(true)

    // cancelled is terminal: nothing comes back from it.
    expect(transitionCard(card.id, "active")).toEqual({
      ok: false,
      reason: "illegal",
    })
    expect(card.status).toBe("cancelled")
  })

  it("reports an unknown card rather than throwing", () => {
    expect(transitionCard("card_nope", "frozen")).toEqual({
      ok: false,
      reason: "not_found",
    })
  })
})

describe("listCards", () => {
  it("puts the newest first, because ops looks for what it just issued", () => {
    const { card } = issueCard({ ...request })
    const dates = listCards().map((entry) => entry.createdAt)

    expect(listCards()[0].id).toBe(card.id)
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it("is a copy, so a caller cannot reorder the store", () => {
    const listed = listCards()
    listed.reverse()

    expect(listCards()[0].id).not.toBe(listed[0].id)
  })
})
