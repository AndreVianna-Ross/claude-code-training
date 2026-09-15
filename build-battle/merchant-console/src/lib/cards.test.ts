import { describe, expect, it } from "vitest"
import { CARD_TRANSITIONS, type FieldErrors, MAX_SPEND_LIMIT, canTransition,
  isSpendWarning, parseIssueRequest, spendPercent } from "./cards"

const MERCHANTS = [{ id: "mch_01", currency: "USD" }, { id: "mch_02", currency: "EUR" }] as const

const valid = { nickname: "Ad spend", merchantId: "mch_01", spendLimit: 25000, currency: "USD" }

describe("the card state machine", () => {
  it("lets a card freeze, come back, and be cancelled from either side", () => {
    expect(canTransition("active", "frozen")).toBe(true)
    expect(canTransition("frozen", "active")).toBe(true)
    expect(canTransition("active", "cancelled")).toBe(true)
    expect(canTransition("frozen", "cancelled")).toBe(true)
  })

  it("treats cancelled as terminal", () => {
    expect(CARD_TRANSITIONS.cancelled).toEqual([])
    expect(canTransition("cancelled", "active")).toBe(false)
    expect(canTransition("cancelled", "frozen")).toBe(false)
    expect(canTransition("cancelled", "cancelled")).toBe(false)
  })

  it("refuses a move to the status a card is already in", () => {
    expect(canTransition("active", "active")).toBe(false)
    expect(canTransition("frozen", "frozen")).toBe(false)
  })
})

describe("parseIssueRequest", () => {
  it("accepts a well-formed request", () => {
    const result = parseIssueRequest(valid, MERCHANTS)
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.value).toMatchObject({ spendLimit: 25000, category: null, requestId: null })
  })

  const rejections: [string, object, keyof FieldErrors][] = [
    ["no merchant", { merchantId: "" }, "merchantId"],
    ["an unknown merchant", { merchantId: "mch_nope" }, "merchantId"],
    ["a zero limit", { spendLimit: 0 }, "spendLimit"],
    ["a negative limit", { spendLimit: -1 }, "spendLimit"],
    ["a large negative limit", { spendLimit: -25000 }, "spendLimit"],
    ["a limit over the cap", { spendLimit: MAX_SPEND_LIMIT + 1 }, "spendLimit"],
    ["a fractional limit", { spendLimit: 250.5 }, "spendLimit"],
    ["a limit sent as a string", { spendLimit: "25000" }, "spendLimit"],
    ["NaN as a limit", { spendLimit: NaN }, "spendLimit"],
    ["Infinity as a limit", { spendLimit: Infinity }, "spendLimit"],
    ["a null limit", { spendLimit: null }, "spendLimit"],
    ["a currency we do not issue", { currency: "JPY" }, "currency"],
    ["a lowercased currency", { currency: "usd" }, "currency"],
    ["an empty currency", { currency: "" }, "currency"],
    ["an absent currency", { currency: undefined }, "currency"],
    ["a numeric currency", { currency: 1 }, "currency"],
    ["a blank nickname", { nickname: "   " }, "nickname"],
    ["an over-long nickname", { nickname: "x".repeat(61) }, "nickname"],
    ["an invented category", { category: "gambling" }, "category"],
    ["a currency the merchant does not settle in", { merchantId: "mch_02" }, "currency"],
  ]

  it.each(rejections)("rejects %s", (_label, patch, field) => {
    const result = parseIssueRequest({ ...valid, ...patch }, MERCHANTS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[field]).toBeDefined()
  })

  it("accepts the limit exactly at the cap", () => {
    expect(parseIssueRequest({ ...valid, spendLimit: MAX_SPEND_LIMIT }, MERCHANTS).ok).toBe(true)
  })

  it("names the merchant's currency, and blames only the merchant when it is the unknown one", () => {
    const mismatch = parseIssueRequest({ ...valid, merchantId: "mch_02" }, MERCHANTS)
    if (!mismatch.ok) expect(mismatch.errors.currency).toContain("EUR")

    const unknown = parseIssueRequest({ ...valid, merchantId: "mch_nope" }, MERCHANTS)
    if (!unknown.ok) {
      expect(unknown.errors.merchantId).toBeDefined()
      expect(unknown.errors.currency).toBeUndefined()
    }
  })

  it("takes a known category", () => {
    const result = parseIssueRequest({ ...valid, category: "software" }, MERCHANTS)
    expect(result.ok && result.value.category).toBe("software")
  })

  it("carries an idempotency key through, and normalises its absence", () => {
    const withKey = parseIssueRequest({ ...valid, requestId: " abc " }, MERCHANTS)
    if (withKey.ok) expect(withKey.value.requestId).toBe("abc")

    for (const requestId of [undefined, null, "", "   ", 7]) {
      const result = parseIssueRequest({ ...valid, requestId }, MERCHANTS)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.requestId).toBeNull()
    }
  })

  it("reports every bad field at once rather than the first", () => {
    const bad = { nickname: "", merchantId: "", spendLimit: -5, currency: "JPY" }
    const result = parseIssueRequest(bad, MERCHANTS)
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual(["currency", "merchantId", "nickname", "spendLimit"])
  })

  it.each([undefined, null, "nope", 7, []])(
    "survives %o as a body instead of throwing",
    (body) => expect(parseIssueRequest(body, MERCHANTS).ok).toBe(false),
  )
})

describe("spend against the limit", () => {
  it.each([
    [0, 25000, 0],
    [12500, 25000, 50],
    [25000, 25000, 100],
    [40000, 25000, 100],
    [100, 0, 0],
  ])("reports %i of %i as %i%%", (spent, spendLimit, percent) => {
    expect(spendPercent({ spent, spendLimit })).toBe(percent)
  })

  it("warns only past 80 percent", () => {
    expect(isSpendWarning({ spent: 20000, spendLimit: 25000 })).toBe(false)
    expect(isSpendWarning({ spent: 20001, spendLimit: 25000 })).toBe(true)
    expect(isSpendWarning({ spent: 24000, spendLimit: 25000 })).toBe(true)
    expect(isSpendWarning({ spent: 100, spendLimit: 0 })).toBe(false)
  })
})
