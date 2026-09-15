import { beforeEach, describe, expect, it } from "vitest"
import { cardById, issueCard, listCards, transitionCard } from "./cards"
import { store } from "./store"

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
  it("returns the number once, never stores it, and starts the card clean", () => {
    const { card, number, replayed } = issueCard({ ...request })

    expect(replayed).toBe(false)
    expect(number).toMatch(/^\d{16}$/)
    expect(card.last4).toBe(number!.slice(-4))
    expect(JSON.stringify(card)).not.toContain(number!)
    expect(cardById(card.id)).toBe(card)
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
    expect(card.id).toMatch(/^card_\d{4}$/)
    expect(store.cards.filter((c) => c.id === card.id)).toHaveLength(1)
  })
})

describe("transitionCard", () => {
  it("moves a card both ways, and seals it once cancelled", () => {
    const { card } = issueCard({ ...request })

    expect(transitionCard(card.id, "frozen").ok).toBe(true)
    expect(transitionCard(card.id, "active").ok).toBe(true)
    expect(transitionCard(card.id, "cancelled").ok).toBe(true)

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
  it("puts the newest first, and hands back a copy", () => {
    const { card } = issueCard({ ...request })
    const dates = listCards().map((entry) => entry.createdAt)
    expect(listCards()[0].id).toBe(card.id)
    expect([...dates].sort().reverse()).toEqual(dates)

    const listed = listCards()
    listed.reverse()
    expect(listCards()[0].id).not.toBe(listed[0].id)
  })
})
