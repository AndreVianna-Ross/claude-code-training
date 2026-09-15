import { describe, expect, it } from "vitest"
import {
  TEST_BIN,
  cardReference,
  generateCardNumber,
  isLuhnValid,
  luhnCheckDigit,
  maskedNumber,
} from "./card-number"

const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}

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
    for (const random of [() => 0, () => 0.9999]) {
      const number = generateCardNumber(random)
      expect(number).toMatch(/^4242\d{12}$/)
      expect(isLuhnValid(number)).toBe(true)
    }
  })

  it("does not return the same number twice in a row", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateCardNumber()))
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe("the Luhn checksum", () => {
  it("accepts the canonical test card and rejects a bent digit", () => {
    expect(isLuhnValid("4242424242424242")).toBe(true)
    expect(isLuhnValid("4242424242424243")).toBe(false)
  })

  it.each(["4242-4242-4242-4242", "", "424242424242424x"])(
    "rejects %o, which is not all digits",
    (input) => expect(isLuhnValid(input)).toBe(false),
  )

  it("computes the digit that completes a partial number", () => {
    expect(luhnCheckDigit("424242424242424")).toBe(2)
    for (let i = 0; i < 200; i++) {
      const partial = TEST_BIN + String(i).padStart(11, "7")
      expect(isLuhnValid(partial + luhnCheckDigit(partial))).toBe(true)
    }
  })
})

describe("what leaves the server", () => {
  it("masks everything but the last four", () => {
    expect(maskedNumber("4242")).toBe("•••• 4242")
    expect(maskedNumber("4242")).not.toContain("4242424242")
  })

  it("draws a reference that cannot depend on the card number", () => {
    const first = cardReference(seeded(7))
    generateCardNumber()
    generateCardNumber()

    expect(cardReference(seeded(7))).toBe(first)
    expect(first).toMatch(/^ref_[a-z2-9]{10}$/)
  })

  it("shares no run of four characters with a generated number", () => {
    const number = generateCardNumber(seeded(11))
    const reference = cardReference(seeded(13))

    for (let start = 0; start + 4 <= number.length; start++) {
      expect(reference).not.toContain(number.slice(start, start + 4))
    }
  })

  it("is unique enough to name a card, with no confusable characters", () => {
    const refs = Array.from({ length: 200 }, () => cardReference())
    expect(new Set(refs).size).toBeGreaterThan(190)
    expect(refs.join("")).not.toMatch(/[01ilo]/)
  })
})
