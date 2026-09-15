/**
 * Card numbers: generation, the Luhn checksum, masking, and the opaque
 * reference. Kept apart from the rest of the card rules deliberately — this is
 * the only module that ever holds a full PAN, so it is small enough to read in
 * one sitting and to review on its own.
 *
 * Numbers are generated HERE, on the server, never in the browser. Every one
 * starts with the 4242 test BIN and carries a valid Luhn check digit, so
 * nothing in this repository can resemble a real PAN.
 */

/** The test BIN. Not optional — see .claude/rules/cards.md. */
export const TEST_BIN = "4242"

const CARD_NUMBER_LENGTH = 16

/**
 * A 16-digit number on the test BIN with a valid check digit.
 *
 * Server-side only. The result is returned to the caller exactly once and is
 * never stored — see the Card type, which has no field for it.
 */
export function generateCardNumber(
  random: () => number = Math.random,
): string {
  let body = TEST_BIN
  while (body.length < CARD_NUMBER_LENGTH - 1) {
    body += Math.floor(random() * 10)
  }
  return body + luhnCheckDigit(body)
}

/**
 * The Luhn check digit for a partial number, so that appending it makes the
 * whole string satisfy the Luhn checksum.
 */
export function luhnCheckDigit(partial: string): number {
  let sum = 0
  // The check digit will sit at the end, so the rightmost digit of `partial`
  // is in a doubled position.
  let double = true

  for (let i = partial.length - 1; i >= 0; i--) {
    let digit = partial.charCodeAt(i) - 48
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }

  return (10 - (sum % 10)) % 10
}

/** Whether a complete number satisfies the Luhn checksum. */
export function isLuhnValid(number: string): boolean {
  if (!/^\d+$/.test(number)) return false

  let sum = 0
  let double = false

  for (let i = number.length - 1; i >= 0; i--) {
    let digit = number.charCodeAt(i) - 48
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }

  return sum % 10 === 0
}

/** How a card's number is shown everywhere except the creation response. */
export function maskedNumber(last4: string): string {
  return `•••• ${last4}`
}

const REFERENCE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
const REFERENCE_LENGTH = 10

/**
 * An opaque handle for a card, drawn independently of its number.
 *
 * It MUST NOT be derived from the number. Deriving it — even from a slice —
 * hands back digits that, with the known 4242 BIN and the stored last four,
 * narrow the PAN to a handful of Luhn-valid candidates. The reference exists
 * to name a card in a support thread, not to encode it.
 */
export function cardReference(random: () => number = Math.random): string {
  let token = ""
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    token += REFERENCE_ALPHABET[Math.floor(random() * REFERENCE_ALPHABET.length)]
  }
  return `ref_${token}`
}
