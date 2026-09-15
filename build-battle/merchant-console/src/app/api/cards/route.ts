import { issueCard, listCards } from "@/data/cards"
import { merchants } from "@/data/merchants"
import { parseIssueRequest } from "@/lib/cards"
import { NextRequest, NextResponse } from "next/server"

export function GET() {
  return NextResponse.json({ cards: listCards() })
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: "Send a JSON body." }, { status: 400 })
  }

  const parsed = parseIssueRequest(body, merchants)

  if (!parsed.ok) {
    return NextResponse.json(
      { message: "Check the highlighted fields.", fields: parsed.errors },
      { status: 400 },
    )
  }

  const { card, number, replayed } = issueCard(parsed.value)

  return NextResponse.json(
    { card, number, replayed },
    { status: replayed ? 200 : 201, headers: { "cache-control": "no-store" } },
  )
}
