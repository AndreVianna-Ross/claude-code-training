import { issueCard, listCards } from "@/data/cards"
import { merchants } from "@/data/merchants"
import { parseIssueRequest } from "@/lib/cards"
import { NextRequest, NextResponse } from "next/server"

/** Every issued card. Masked: the response carries last4, never a number. */
export function GET() {
  return NextResponse.json({ cards: listCards() })
}

/**
 * Issues a card.
 *
 * This is the ONE response in the app that contains a full card number
 * (.claude/rules/cards.md). It is not stored, and no other route can return
 * it, because the Card record has no field for it.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: "Send a JSON body." }, { status: 400 })
  }

  // The client is not trusted: merchant, currency, limit and category are all
  // checked against allowlists before anything reaches the store (ORG-7).
  const parsed = parseIssueRequest(body, merchants)

  if (!parsed.ok) {
    return NextResponse.json(
      { message: "Check the highlighted fields.", fields: parsed.errors },
      { status: 400 },
    )
  }

  const { card, number, replayed } = issueCard(parsed.value)

  // A replay is 200, not 201: it created nothing. It also carries no number,
  // so a retry cannot be used to read the reveal a second time.
  return NextResponse.json(
    { card, number, replayed },
    // no-store so the one response carrying a live number is not held by a
    // browser or proxy cache after the reveal panel has closed.
    { status: replayed ? 200 : 201, headers: { "cache-control": "no-store" } },
  )
}
