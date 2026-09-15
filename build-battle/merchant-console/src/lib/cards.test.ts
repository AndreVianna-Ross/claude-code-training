import { describe, expect, it } from "vitest"
import { type FieldErrors, MAX_SPEND_LIMIT, canTransition,
  isSpendWarning, parseIssueRequest, spendPercent } from "./cards"

const MERCHANTS = [{ id: "mch_01", currency: "USD" }, { id: "mch_02", currency: "EUR" }] as const

const valid = { nickname: "Ad spend", merchantId: "mch_01", spendLimit: 25000, currency: "USD" }

describe("the card state machine", () => {
  it("allows the two edges the HTTP walk never reaches", () => {
    expect(canTransition("frozen", "cancelled")).toBe(true)
    expect(canTransition("active", "active")).toBe(false)
  })
})

describe("parseIssueRequest", () => {
  it("accepts a well-formed request, the cap, a category and an idempotency key", () => {
    const result = parseIssueRequest(valid, MERCHANTS)
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.value).toMatchObject({ spendLimit: 25000, category: null, requestId: null })

    expect(parseIssueRequest({ ...valid, spendLimit: MAX_SPEND_LIMIT }, MERCHANTS).ok).toBe(true)

    const locked = parseIssueRequest({ ...valid, category: "software" }, MERCHANTS)
    expect(locked.ok && locked.value.category).toBe("software")

    const withKey = parseIssueRequest({ ...valid, requestId: " abc " }, MERCHANTS)
    if (withKey.ok) expect(withKey.value.requestId).toBe("abc")

    for (const requestId of [undefined, null, "", "   ", 7]) {
      const blank = parseIssueRequest({ ...valid, requestId }, MERCHANTS)
      expect(blank.ok).toBe(true)
      if (blank.ok) expect(blank.value.requestId).toBeNull()
    }
  })

  const rejections: [string, object, keyof FieldErrors][] = [
    ["a limit sent as a string", { spendLimit: "25000" }, "spendLimit"],
    ["a lowercased currency", { currency: "usd" }, "currency"],
    ["an empty currency", { currency: "" }, "currency"],
    ["an over-long nickname", { nickname: "x".repeat(61) }, "nickname"],
  ]

  it.each(rejections)("rejects %s", (_label, patch, field) => {
    const result = parseIssueRequest({ ...valid, ...patch }, MERCHANTS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[field]).toBeDefined()
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

  it("reports every bad field at once rather than the first", () => {
    const bad = { nickname: "", merchantId: "", spendLimit: -5, currency: "JPY" }
    const result = parseIssueRequest(bad, MERCHANTS)
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual(["currency", "merchantId", "nickname", "spendLimit"])
  })

  it.each([null, "nope"])(
    "survives %o as a body instead of throwing",
    (body) => expect(parseIssueRequest(body, MERCHANTS).ok).toBe(false),
  )
})

describe("spend against the limit", () => {
  it.each([
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
    expect(isSpendWarning({ spent: 100, spendLimit: 0 })).toBe(false)
  })
})
