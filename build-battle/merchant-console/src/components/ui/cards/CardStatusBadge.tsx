import { Badge } from "@/components/Badge"
import { CardStatus } from "@/data/types"
import { CARD_STATUS_LABELS } from "@/lib/cards"
import { cx } from "@/lib/utils"

type Look = [variant: "success" | "default" | "neutral", dot: string]

const LOOKS: Record<CardStatus, Look> = {
  active: ["success", "bg-emerald-600 dark:bg-emerald-400"],
  frozen: ["default", "bg-blue-500 dark:bg-blue-500"],
  cancelled: ["neutral", "bg-gray-500 dark:bg-gray-500"],
}

export function CardStatusBadge({ status }: { status: CardStatus }) {
  const [variant, dot] = LOOKS[status]
  return (
    <Badge variant={variant} className="rounded-full">
      <span
        className={cx("size-1.5 shrink-0 rounded-full", dot)}
        aria-hidden="true"
      />
      {CARD_STATUS_LABELS[status]}
    </Badge>
  )
}
