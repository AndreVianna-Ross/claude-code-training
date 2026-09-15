import { describe, expect, it } from "vitest"
import {
  TEST_BIN,
  cardReference,
  generateCardNumber,
  isLuhnValid,
  luhnCheckDigit,
  maskedNumber,
} from "./card-number"

/**
 * A number that resembles a real PAN is the one unrecoverable mistake in this
 * feature, so the generator is tested hard: the BIN, the length and the check
 * digit, over enough samples that a bad branch cannot hide.
 */

describe("isLuhnValid", () => {
  it("accepts the canonical test card and rejects a bent digit", () => {
    expect(isLuhnValid("4242424242424242")).toBe(true)
    expect(isLuhnValid("4242424242424243")).toBe(false)
  })

  it.each(["4242-4242-4242-4242", "", "424242424242424x"])(
    "rejects %o because it is not all digits",
    (input) => {
      expect(isLuhnValid(input)).toBe(false)
    },
  )
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
    // shows up, and Math.random never lands on them.
    for (const random of [() => 0, () => 0.9999]) {
      const number = generateCardNumber(random)
      expect(number).toMatch(/^\d{16}$/)
      expect(number.startsWith(TEST_BIN)).toBe(true)
      expect(isLuhnValid(number)).toBe(true)
    }
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
    // handful of Luhn-valid candidates. The property that matters is that the
    // reference is drawn independently, so it shares no run with the number.
    //
    // Note it is NOT "contains no digits": the alphabet includes 2-9, so four
    // digits in a row turn up by chance. Asserting their absence would be a
    // test that fails a few times in a hundred for no good reason.
    for (let i = 0; i < 200; i++) {
      const number = generateCardNumber()
      const reference = cardReference()
      for (let start = 0; start + 4 <= number.length; start++) {
        expect(reference).not.toContain(number.slice(start, start + 4))
      }
    }
  })

  it("draws from an alphabet with no confusable characters", () => {
    // No 0/o/1/l/i, so a reference read aloud in a support call survives it.
    const refs = Array.from({ length: 200 }, () => cardReference()).join("")
    expect(refs).not.toMatch(/[01ilo]/)
  })
})
