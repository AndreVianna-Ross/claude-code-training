import { cardById, transitionCard } from "@/data/cards"
import { isCardStatus } from "@/lib/cards"
import { NextRequest, NextResponse } from "next/server"

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const card = cardById(id)

  if (!card) {
    return NextResponse.json({ message: "No such card." }, { status: 404 })
  }
  return NextResponse.json({ card })
}

export async function PATCH(request: NextRequest, { params }: Context) {
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
          { message: `That card cannot move to ${status} from where it is.` },
          { status: 409 },
        )
  }

  return NextResponse.json({ card: result.card })
}
