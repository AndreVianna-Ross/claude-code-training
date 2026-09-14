import { cardById, transitionCard } from "@/data/cards"
import { isCardStatus } from "@/lib/cards"
import { NextRequest, NextResponse } from "next/server"

/** One card. Masked — last4 only, never a full number. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const card = cardById(id)

  if (!card) {
    return NextResponse.json({ message: "No such card." }, { status: 404 })
  }
  return NextResponse.json({ card })
}

/**
 * Moves a card's status. The state machine is enforced here, not only in the
 * UI: `active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: "Send a JSON body." }, { status: 400 })
  }

  const status = (body as { status?: unknown } | null)?.status
  if (!isCardStatus(status)) {
    return NextResponse.json(
      { message: "Status must be active, frozen or cancelled." },
      { status: 400 },
    )
  }

  const result = transitionCard(id, status)

  if (!result.ok) {
    return result.reason === "not_found"
      ? NextResponse.json({ message: "No such card." }, { status: 404 })
      : NextResponse.json(
          {
            message: `That card cannot move to ${status} from where it is.`,
          },
          // 409: the request is well-formed, the card's current state refuses it.
          { status: 409 },
        )
  }

  return NextResponse.json({ card: result.card })
}
