import { Divider } from "@/components/Divider"
import { CardStatusBadge } from "@/components/ui/cards/CardStatusBadge"
import { cardById } from "@/data/cards"
import { merchantById } from "@/data/merchants"
import { maskedNumber } from "@/lib/card-number"
import {
  CARD_CATEGORY_LABELS,
  CARD_STATUS_LABELS,
  isSpendWarning,
  spendPercent,
} from "@/lib/cards"
import { formatInZone } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cx } from "@/lib/utils"
import Link from "next/link"
import { notFound } from "next/navigation"

const BAR_WIDTHS = [
  "w-0", "w-[5%]", "w-[10%]", "w-[15%]", "w-[20%]", "w-[25%]", "w-[30%]",
  "w-[35%]", "w-[40%]", "w-[45%]", "w-[50%]", "w-[55%]", "w-[60%]", "w-[65%]",
  "w-[70%]", "w-[75%]", "w-[80%]", "w-[85%]", "w-[90%]", "w-[95%]", "w-full",
] as const

export default async function CardDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const card = cardById(id)
  if (!card) notFound()

  const merchant = merchantById(card.merchantId)
  const percent = spendPercent(card)
  const warning = isSpendWarning(card)
  const remaining = Math.max(0, card.spendLimit - card.spent)
  const zone = merchant?.timezone ?? "UTC"

  return (
    <div className="p-4 sm:p-6">
      <Link
        href="/cards"
        className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-50"
      >
        ← All cards
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
          {card.nickname}
        </h1>
        <CardStatusBadge status={card.status} />
        {card.category && (
          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {CARD_CATEGORY_LABELS[card.category]} only
          </span>
        )}
      </div>
      <p className="mt-1 font-mono text-sm text-gray-500">
        {maskedNumber(card.last4)} · {card.id}
      </p>

      <Divider />

      <section aria-labelledby="spend-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="spend-heading"
            className="text-sm font-semibold text-gray-900 dark:text-gray-50"
          >
            Spend against limit
          </h2>
          <p className="text-sm tabular-nums text-gray-500">
            {formatMoney(card.spent, card.currency)} of{" "}
            {formatMoney(card.spendLimit, card.currency)} · {percent}%
          </p>
        </div>
        <div
          className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-labelledby="spend-heading"
        >
          <div
            className={cx(
              "h-full rounded-full transition-all",
              warning ? "bg-amber-500" : "bg-blue-500",
              BAR_WIDTHS[Math.round(percent / 5)],
            )}
          />
        </div>

        <p className="mt-2 text-sm text-gray-500">
          {warning
            ? `Past 80% of the limit — ${formatMoney(remaining, card.currency)} left.`
            : `${formatMoney(remaining, card.currency)} left to spend.`}
        </p>
      </section>

      <Divider />

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ["Merchant", merchant?.name ?? card.merchantId, false],
            [
              "Spend limit",
              `${formatMoney(card.spendLimit, card.currency)} ${card.currency}`,
              false,
            ],
            ["Spent", formatMoney(card.spent, card.currency), false],
            ["Number", maskedNumber(card.last4), true],
            ["Reference", card.reference, true],
            [
              "Category lock",
              card.category ? CARD_CATEGORY_LABELS[card.category] : "None",
              false,
            ],
            ["Status", CARD_STATUS_LABELS[card.status], false],
            [`Created (${zone})`, formatInZone(card.createdAt, zone), false],
          ] as const
        ).map(([label, value, mono]) => (
          <div key={label}>
            <dt className="text-sm text-gray-500">{label}</dt>
            <dd
              className={cx(
                "text-sm text-gray-900 dark:text-gray-50",
                mono ? "font-mono" : "font-medium tabular-nums",
              )}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 text-sm text-gray-500">
        The full number was shown once, when this card was issued. Only the last
        four is kept.
      </p>
    </div>
  )
}
