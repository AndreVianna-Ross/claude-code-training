export const TEST_BIN = "4242"

const CARD_NUMBER_LENGTH = 16

export function generateCardNumber(
  random: () => number = Math.random,
): string {
  let body = TEST_BIN
  while (body.length < CARD_NUMBER_LENGTH - 1) {
    body += Math.floor(random() * 10)
  }
  return body + luhnCheckDigit(body)
}

export function luhnCheckDigit(partial: string): number {
  let sum = 0
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

export const maskedNumber = (last4: string): string => `•••• ${last4}`

const REFERENCE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
const REFERENCE_LENGTH = 10

export function cardReference(random: () => number = Math.random): string {
  let token = ""
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    token += REFERENCE_ALPHABET[Math.floor(random() * REFERENCE_ALPHABET.length)]
  }
  return `ref_${token}`
}
