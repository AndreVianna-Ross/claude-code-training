import { issueCard, listCards } from "@/data/cards"
import { merchants } from "@/data/merchants"
import { parseIssueRequest } from "@/lib/cards"

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } })

export function GET() {
  return json({ cards: listCards() })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ message: "Send a JSON body.", fields: {} }, 400)
  }

  const parsed = parseIssueRequest(body, merchants)

  if (!parsed.ok) {
    return json(
      { message: "Check the highlighted fields.", fields: parsed.errors },
      400,
    )
  }

  const { card, number, replayed } = issueCard(parsed.value)
  return json({ card, number, replayed }, replayed ? 200 : 201)
}
