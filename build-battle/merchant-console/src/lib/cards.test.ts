import { describe, expect, it } from "vitest"
import {
  CARD_TRANSITIONS,
  type FieldErrors,
  MAX_SPEND_LIMIT,
  canTransition,
  isSpendWarning,
  parseIssueRequest,
  spendPercent,
} from "./cards"

// Objects, not ids: a card must settle in its merchant's currency, so the
// parser needs the currency to check it against. mch_02 is EUR.
const MERCHANTS = [
  { id: "mch_01", currency: "USD" },
  { id: "mch_02", currency: "EUR" },
] as const

const valid = {
  nickname: "Ad spend",
  merchantId: "mch_01",
  spendLimit: 25000,
  currency: "USD",
}

describe("the card state machine", () => {
  it("lets a card freeze, come back, and be cancelled from either side", () => {
    expect(canTransition("active", "frozen")).toBe(true)
    expect(canTransition("frozen", "active")).toBe(true)
    expect(canTransition("active", "cancelled")).toBe(true)
    expect(canTransition("frozen", "cancelled")).toBe(true)
  })

  it("treats cancelled as terminal", () => {
    // An empty list is a rule; a missing key would be an oversight.
    expect(CARD_TRANSITIONS.cancelled).toEqual([])
    expect(canTransition("cancelled", "active")).toBe(false)
    expect(canTransition("cancelled", "frozen")).toBe(false)
    expect(canTransition("cancelled", "cancelled")).toBe(false)
  })

  it("refuses a move to the status a card is already in", () => {
    // So a double click is reported rather than looking like it worked twice.
    expect(canTransition("active", "active")).toBe(false)
    expect(canTransition("frozen", "frozen")).toBe(false)
  })
})

describe("parseIssueRequest", () => {
  it("accepts a well-formed request", () => {
    const result = parseIssueRequest(valid, MERCHANTS)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.spendLimit).toBe(25000)
      expect(result.value.category).toBeNull()
      expect(result.value.requestId).toBeNull()
    }
  })

  // One row per way a request can be wrong: the interesting thing is the
  // coverage of the set, not twenty near-identical bodies.
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
    // The bound is inclusive, which is the off-by-one worth pinning down.
    expect(
      parseIssueRequest({ ...valid, spendLimit: MAX_SPEND_LIMIT }, MERCHANTS).ok,
    ).toBe(true)
  })

  it("names the merchant's currency, so the fix is obvious", () => {
    const result = parseIssueRequest(
      { ...valid, merchantId: "mch_02" },
      MERCHANTS,
    )
    if (!result.ok) expect(result.errors.currency).toContain("EUR")
  })

  it("does not blame the currency when the merchant is the unknown one", () => {
    // Otherwise a typo in the merchant reports two errors and the operator
    // fixes the wrong field.
    const result = parseIssueRequest(
      { ...valid, merchantId: "mch_nope" },
      MERCHANTS,
    )
    if (!result.ok) {
      expect(result.errors.merchantId).toBeDefined()
      expect(result.errors.currency).toBeUndefined()
    }
  })

  it("takes a known category", () => {
    const result = parseIssueRequest(
      { ...valid, category: "software" },
      MERCHANTS,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.category).toBe("software")
  })

  it("carries an idempotency key through, and normalises its absence", () => {
    const withKey = parseIssueRequest(
      { ...valid, requestId: " abc " },
      MERCHANTS,
    )
    if (withKey.ok) expect(withKey.value.requestId).toBe("abc")

    for (const requestId of [undefined, null, "", "   ", 7]) {
      const result = parseIssueRequest({ ...valid, requestId }, MERCHANTS)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.requestId).toBeNull()
    }
  })

  it("reports every bad field at once rather than the first", () => {
    const result = parseIssueRequest(
      { nickname: "", merchantId: "", spendLimit: -5, currency: "JPY" },
      MERCHANTS,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "currency",
        "merchantId",
        "nickname",
        "spendLimit",
      ])
    }
  })

  it.each([undefined, null, "nope", 7, []])(
    "survives %o as a body instead of throwing",
    (body) => {
      expect(parseIssueRequest(body, MERCHANTS).ok).toBe(false)
    },
  )
})

describe("spend against the limit", () => {
  it.each([
    [0, 25000, 0],
    [12500, 25000, 50],
    [25000, 25000, 100],
    [40000, 25000, 100], // clamped rather than reporting past 100
    [100, 0, 0], // no division by zero
  ])("reports %i of %i as %i%%", (spent, spendLimit, percent) => {
    expect(spendPercent({ spent, spendLimit })).toBe(percent)
  })

  it("warns only past 80 percent", () => {
    // 20001/25000 is 80.004%, which rounds to 80 — so this must compare as
    // integers, or a card just past the line does not warn.
    expect(isSpendWarning({ spent: 20000, spendLimit: 25000 })).toBe(false)
    expect(isSpendWarning({ spent: 20001, spendLimit: 25000 })).toBe(true)
    expect(isSpendWarning({ spent: 24000, spendLimit: 25000 })).toBe(true)
    expect(isSpendWarning({ spent: 100, spendLimit: 0 })).toBe(false)
  })
})
