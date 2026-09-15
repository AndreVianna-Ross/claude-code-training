import { listCards } from "@/data/cards"
import { describe, expect, it } from "vitest"
import { GET, POST } from "./route"

const valid = {
  nickname: "Ad spend",
  merchantId: "mch_01",
  spendLimit: 25_000,
  currency: "USD",
}

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/cards", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  )

const rejections: [string, Record<string, unknown>, string][] = [
  ["an unknown merchant", { merchantId: "mch_nope" }, "merchantId"],
  ["a currency the merchant does not settle in", { currency: "EUR" }, "currency"],
  ["a limit of zero", { spendLimit: 0 }, "spendLimit"],
  ["a limit over the cap", { spendLimit: 5_000_001 }, "spendLimit"],
  ["a limit that is not whole minor units", { spendLimit: 250.5 }, "spendLimit"],
  ["a blank nickname", { nickname: "   " }, "nickname"],
  ["an unknown category", { category: "gambling" }, "category"],
]

describe("POST /api/cards", () => {
  it("issues with 201, reveals the number once, and forbids caching", async () => {
    const response = await post(valid)
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(body.number).toMatch(/^4242\d{12}$/)
    expect(body.replayed).toBe(false)
    expect(body.card.last4).toBe(body.number.slice(-4))
    expect(JSON.stringify(body.card)).not.toContain(body.number)
  })

  it("replays a request id with 200, withholding the number", async () => {
    const first = await (await post({ ...valid, requestId: "same-key" })).json()
    const before = listCards().length

    const response = await post({ ...valid, requestId: "same-key" })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.replayed).toBe(true)
    expect(body.number).toBeNull()
    expect(body.card.id).toBe(first.card.id)
    expect(listCards()).toHaveLength(before)
  })

  it.each(rejections)("rejects %s with 400 naming the field", async (_l, patch, field) => {
    const response = await post({ ...valid, ...patch })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.fields[field]).toBeTruthy()
  })

  it("rejects a body that is not JSON, in the same error shape", async () => {
    const response = await post("not json at all")
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.message).toBeTruthy()
    expect(body.fields).toEqual({})
  })
})

describe("GET /api/cards", () => {
  it("lists cards with no number anywhere, and forbids caching", async () => {
    const response = GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(body.cards.length).toBeGreaterThan(0)
    expect(JSON.stringify(body)).not.toContain('"number"')
  })
})
