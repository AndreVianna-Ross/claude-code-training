import { issueCard } from "@/data/cards"
import { describe, expect, it } from "vitest"
import { GET, PATCH } from "./route"

const context = (id: string) => ({ params: Promise.resolve({ id }) })

const newCard = () =>
  issueCard({
    nickname: "Ad spend",
    merchantId: "mch_01",
    spendLimit: 25_000,
    currency: "USD",
    category: null,
    requestId: null,
  }).card

const patch = (id: string, status: unknown) =>
  PATCH(
    new Request(`http://localhost/api/cards/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
    context(id),
  )

describe("GET /api/cards/[id]", () => {
  it("returns the card, and 404 for an id nothing holds", async () => {
    const card = newCard()

    const found = await GET(new Request("http://localhost"), context(card.id))
    expect(found.status).toBe(200)
    expect((await found.json()).card.id).toBe(card.id)

    const miss = await GET(new Request("http://localhost"), context("card_9999"))
    expect(miss.status).toBe(404)
  })
})

describe("PATCH /api/cards/[id]", () => {
  it("walks every legal edge over HTTP and refuses the rest with 409", async () => {
    const card = newCard()

    expect((await patch(card.id, "frozen")).status).toBe(200)
    expect((await patch(card.id, "frozen")).status).toBe(409)
    expect((await patch(card.id, "active")).status).toBe(200)
    expect((await patch(card.id, "cancelled")).status).toBe(200)
    expect((await patch(card.id, "active")).status).toBe(409)
    expect((await patch(card.id, "frozen")).status).toBe(409)
  })

  it("rejects a status outside the allowlist with 400", async () => {
    const response = await patch(newCard().id, "deleted")

    expect(response.status).toBe(400)
    expect((await response.json()).message).toBeTruthy()
  })

  it("reports an unknown card with 404 rather than throwing", async () => {
    expect((await patch("card_9999", "frozen")).status).toBe(404)
  })
})
