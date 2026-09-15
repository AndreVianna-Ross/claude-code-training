import { cardById, transitionCard } from "@/data/cards"
import { isCardStatus } from "@/lib/cards"

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params
  const card = cardById(id)

  if (!card) {
    return Response.json({ message: "No such card." }, { status: 404 })
  }
  return Response.json({ card })
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ message: "Send a JSON body." }, { status: 400 })
  }

  const status = (body as { status?: unknown } | null)?.status
  if (!isCardStatus(status)) {
    const message = "Status must be active, frozen or cancelled."
    return Response.json({ message }, { status: 400 })
  }

  const result = transitionCard(id, status)

  if (!result.ok) {
    return result.reason === "not_found"
      ? Response.json({ message: "No such card." }, { status: 404 })
      : Response.json(
          { message: `That card cannot move to ${status} from where it is.` },
          { status: 409 },
        )
  }

  return Response.json({ card: result.card })
}
