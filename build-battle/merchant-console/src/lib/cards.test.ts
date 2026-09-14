import { describe, expect, it } from "vitest"
import {
  CARD_TRANSITIONS,
  MAX_SPEND_LIMIT,
  TEST_BIN,
  canTransition,
  cardReference,
  generateCardNumber,
  isLuhnValid,
  isSpendWarning,
  luhnCheckDigit,
  maskedNumber,
  parseIssueRequest,
  spendPercent,
} from "./cards"

/**
 * A card number that resembles a real PAN is the one unrecoverable mistake in
 * this feature, so the generator is tested hard: the BIN, the length, and the
 * check digit, over enough samples that a bad branch cannot hide.
 */

const MERCHANT_IDS = ["mch_01", "mch_02"]

const valid = {
  nickname: "Ad spend",
  merchantId: "mch_01",
  spendLimit: 25000,
  currency: "USD",
}

describe("isLuhnValid", () => {
  it("accepts the canonical test card", () => {
    expect(isLuhnValid("4242424242424242")).toBe(true)
  })

  it("rejects the same number with one digit changed", () => {
    expect(isLuhnValid("4242424242424243")).toBe(false)
  })

  it("rejects anything that is not all digits", () => {
    expect(isLuhnValid("4242-4242-4242-4242")).toBe(false)
    expect(isLuhnValid("")).toBe(false)
    expect(isLuhnValid("424242424242424x")).toBe(false)
  })
})

describe("luhnCheckDigit", () => {
  it("produces the digit that completes the canonical test card", () => {
    // 4242424242424242 is Luhn-valid, so the first 15 digits must want a 2.
    expect(luhnCheckDigit("424242424242424")).toBe(2)
  })

  it("always yields a number whose completed form validates", () => {
    for (let i = 0; i < 200; i++) {
      const partial = TEST_BIN + String(i).padStart(11, "7")
      expect(isLuhnValid(partial + luhnCheckDigit(partial))).toBe(true)
    }
  })
})

describe("generateCardNumber", () => {
  it("is 16 digits on the test BIN with a valid check digit, every time", () => {
    for (let i = 0; i < 500; i++) {
      const number = generateCardNumber()
      expect(number).toMatch(/^\d{16}$/)
      expect(number.startsWith(TEST_BIN)).toBe(true)
      expect(isLuhnValid(number)).toBe(true)
    }
  })

  it("holds at the extremes of its randomness", () => {
    // All-zero and all-nine bodies are where an off-by-one in the check digit
    // shows up.
    expect(isLuhnValid(generateCardNumber(() => 0))).toBe(true)
    expect(isLuhnValid(generateCardNumber(() => 0.9999))).toBe(true)
    expect(generateCardNumber(() => 0).startsWith(TEST_BIN)).toBe(true)
  })

  it("does not return the same number twice in a row", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateCardNumber()))
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe("maskedNumber", () => {
  it("shows only the last four", () => {
    expect(maskedNumber("4242")).toBe("•••• 4242")
    expect(maskedNumber("4242")).not.toContain("4242424242")
  })
})

describe("cardReference", () => {
  it("is opaque and unique enough to name a card", () => {
    const refs = new Set(Array.from({ length: 200 }, () => cardReference()))
    expect(refs.size).toBeGreaterThan(190)
    expect(cardReference()).toMatch(/^ref_[a-z2-9]{10}$/)
  })

  it("leaks no part of a card number", () => {
    // A reference derived from the number is a PAN disclosure: with the known
    // 4242 BIN and the stored last four, a six-digit slice leaves only a
    // handful of Luhn-valid candidates. It must share nothing with the number.
    for (let i = 0; i < 200; i++) {
      const number = generateCardNumber()
      const reference = cardReference()
      expect(reference).not.toContain(number)
      expect(reference).not.toContain(number.slice(-4))
      for (let start = 0; start + 4 <= number.length; start++) {
        expect(reference).not.toContain(number.slice(start, start + 4))
      }
    }
  })

  it("carries no digits a PAN could be rebuilt from", () => {
    expect(cardReference()).not.toMatch(/\d{4}/)
  })
})

describe("the card state machine", () => {
  it("lets an active card freeze and a frozen card come back", () => {
    expect(canTransition("active", "frozen")).toBe(true)
    expect(canTransition("frozen", "active")).toBe(true)
  })

  it("lets either side cancel", () => {
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
    const result = parseIssueRequest(valid, MERCHANT_IDS)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.spendLimit).toBe(25000)
      expect(result.value.category).toBeNull()
    }
  })

  it("rejects a missing merchant, and an unknown one", () => {
    const missing = parseIssueRequest({ ...valid, merchantId: "" }, MERCHANT_IDS)
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.errors.merchantId).toBeDefined()

    const unknown = parseIssueRequest(
      { ...valid, merchantId: "mch_nope" },
      MERCHANT_IDS,
    )
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.errors.merchantId).toBeDefined()
  })

  it("rejects a zero or negative limit", () => {
    for (const spendLimit of [0, -1, -25000]) {
      const result = parseIssueRequest({ ...valid, spendLimit }, MERCHANT_IDS)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors.spendLimit).toBeDefined()
    }
  })

  it("rejects a limit above 5,000,000 minor units but accepts exactly that", () => {
    const over = parseIssueRequest(
      { ...valid, spendLimit: MAX_SPEND_LIMIT + 1 },
      MERCHANT_IDS,
    )
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.errors.spendLimit).toBeDefined()

    expect(
      parseIssueRequest({ ...valid, spendLimit: MAX_SPEND_LIMIT }, MERCHANT_IDS)
        .ok,
    ).toBe(true)
  })

  it("rejects a limit that is not an integer number of minor units", () => {
    for (const spendLimit of [250.5, "25000", NaN, Infinity, null]) {
      const result = parseIssueRequest({ ...valid, spendLimit }, MERCHANT_IDS)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors.spendLimit).toBeDefined()
    }
  })

  it("rejects a currency we do not issue in", () => {
    for (const currency of ["JPY", "usd", "", undefined, 1]) {
      const result = parseIssueRequest({ ...valid, currency }, MERCHANT_IDS)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors.currency).toBeDefined()
    }
  })

  it("requires a nickname and caps its length", () => {
    expect(parseIssueRequest({ ...valid, nickname: "   " }, MERCHANT_IDS).ok).toBe(
      false,
    )
    expect(
      parseIssueRequest({ ...valid, nickname: "x".repeat(61) }, MERCHANT_IDS).ok,
    ).toBe(false)
  })

  it("takes a known category and refuses an invented one", () => {
    const ok = parseIssueRequest(
      { ...valid, category: "software" },
      MERCHANT_IDS,
    )
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.category).toBe("software")

    const bad = parseIssueRequest(
      { ...valid, category: "gambling" },
      MERCHANT_IDS,
    )
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors.category).toBeDefined()
  })

  it("reports every bad field at once rather than the first", () => {
    const result = parseIssueRequest(
      { nickname: "", merchantId: "", spendLimit: -5, currency: "JPY" },
      MERCHANT_IDS,
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

  it("survives an absent or junk body instead of throwing", () => {
    for (const body of [undefined, null, "nope", 7, []]) {
      expect(parseIssueRequest(body, MERCHANT_IDS).ok).toBe(false)
    }
  })
})

describe("spend against the limit", () => {
  it("reports a whole percentage", () => {
    expect(spendPercent({ spent: 0, spendLimit: 25000 })).toBe(0)
    expect(spendPercent({ spent: 12500, spendLimit: 25000 })).toBe(50)
    expect(spendPercent({ spent: 25000, spendLimit: 25000 })).toBe(100)
  })

  it("clamps overspend rather than reporting past 100", () => {
    expect(spendPercent({ spent: 40000, spendLimit: 25000 })).toBe(100)
  })

  it("does not divide by zero", () => {
    expect(spendPercent({ spent: 100, spendLimit: 0 })).toBe(0)
  })

  it("warns only past 80 percent", () => {
    expect(isSpendWarning({ spent: 20000, spendLimit: 25000 })).toBe(false)
    expect(isSpendWarning({ spent: 20001, spendLimit: 25000 })).toBe(true)
    expect(isSpendWarning({ spent: 24000, spendLimit: 25000 })).toBe(true)
  })
})
