"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import { Input } from "@/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { Card, Currency } from "@/data/types"
import {
  CARD_CATEGORIES,
  CARD_CATEGORY_LABELS,
  CARD_CURRENCIES,
  type FieldErrors,
} from "@/lib/cards"
import { formatMoney, parseAmountToMinorUnits } from "@/lib/money"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

const NONE = "__none__"

type Merchant = { id: string; name: string; currency: Currency }
type Option = readonly [value: string, label: string]
type Issued = { card: Card; number: string }

const CATEGORY_OPTIONS: readonly Option[] = [
  [NONE, "No lock"],
  ...CARD_CATEGORIES.map((value) => [value, CARD_CATEGORY_LABELS[value]] as const),
]

function Field(props: {
  id: string
  label: React.ReactNode
  error?: string
  value: string
  onChange: (value: string) => void
  options?: readonly Option[]
  placeholder?: string
  inputMode?: "decimal"
}) {
  const { id, error, options } = props
  return (
    <div>
      <label
        htmlFor={id}
        className="text-sm font-medium text-gray-900 dark:text-gray-50"
      >
        {props.label}
      </label>
      <div className="mt-1.5">
        {options ? (
          <Select value={props.value} onValueChange={props.onChange}>
            <SelectTrigger id={id}>
              <SelectValue placeholder={props.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={id}
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            placeholder={props.placeholder}
            inputMode={props.inputMode}
            hasError={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

export function IssueCardDialog({ merchants }: { merchants: Merchant[] }) {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [nickname, setNickname] = useState("")
  const [merchantId, setMerchantId] = useState("")
  const [limit, setLimit] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [category, setCategory] = useState(NONE)

  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const selected = merchants.find((entry) => entry.id === merchantId) ?? null
  const currencies = selected ? [selected.currency] : CARD_CURRENCIES

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) return
    setNickname("")
    setMerchantId("")
    setLimit("")
    setCurrency("USD")
    setCategory(NONE)
    setErrors({})
    setFormError(null)
    setIssued(null)
    setRequestId(crypto.randomUUID())
  }

  const submit = async () => {
    setErrors({})
    setFormError(null)
    const spendLimit = parseAmountToMinorUnits(limit)
    if (spendLimit === null) {
      setErrors({ spendLimit: "Enter an amount like 250 or 250.00." })
      return
    }

    setSaving(true)
    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nickname,
          merchantId,
          spendLimit,
          currency,
          category: category === NONE ? null : category,
          requestId,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        setErrors(payload.fields ?? {})
        setFormError(payload.message ?? "Could not issue the card.")
        return
      }

      setIssued(payload)
      router.refresh()
    } catch {
      setFormError("Could not reach the server. Nothing was issued.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button className="w-full gap-2 py-1.5 sm:w-fit">
          <Plus className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
          Issue card
        </Button>
      </DrawerTrigger>

      <DrawerContent className="sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>
            {issued ? "Card issued" : "Issue a virtual card"}
          </DrawerTitle>
          <DrawerDescription>
            {issued
              ? "This is the only time the full number is shown. Copy it now — afterwards only the last four is kept."
              : "Single merchant, with a limit from the moment it exists."}
          </DrawerDescription>
        </DrawerHeader>

        {issued ? (
          <>
            <DrawerBody className="space-y-4">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Card number
                </p>
                <p className="mt-1 font-mono text-lg tabular-nums text-gray-900 dark:text-gray-50">
                  {issued.number.replace(/(.{4})/g, "$1 ").trim()}
                </p>
              </div>
              <p className="text-sm text-gray-500">
                {issued.card.nickname} ·{" "}
                {formatMoney(issued.card.spendLimit, issued.card.currency)}{" "}
                {issued.card.currency} limit
              </p>
            </DrawerBody>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button className="w-full">Done</Button>
              </DrawerClose>
            </DrawerFooter>
          </>
        ) : (
          <>
            <DrawerBody className="space-y-4">
              {formError && (
                <p
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
                >
                  {formError}
                </p>
              )}

              <Field
                id="card-nickname"
                label="Nickname"
                error={errors.nickname}
                value={nickname}
                onChange={setNickname}
                placeholder="Google Ads"
              />

              <Field
                id="card-merchant"
                label="Merchant"
                error={errors.merchantId}
                value={merchantId}
                placeholder="Choose a merchant"
                options={merchants.map((m) => [m.id, m.name] as const)}
                onChange={(value) => {
                  setMerchantId(value)
                  const merchant = merchants.find((m) => m.id === value)
                  if (merchant) setCurrency(merchant.currency)
                }}
              />

              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <Field
                  id="card-limit"
                  label="Spend limit"
                  error={errors.spendLimit}
                  value={limit}
                  onChange={setLimit}
                  placeholder="2500.00"
                  inputMode="decimal"
                />
                <Field
                  id="card-currency"
                  label="Currency"
                  error={errors.currency}
                  value={currency}
                  options={currencies.map((code) => [code, code] as const)}
                  onChange={(value) => setCurrency(value as Currency)}
                />
              </div>
              {selected && (
                <p className="-mt-2 text-sm text-gray-500">
                  {selected.name} settles in {selected.currency}, so the card
                  does too.
                </p>
              )}

              <Field
                id="card-category"
                label={
                  <>
                    Category lock{" "}
                    <span className="font-normal text-gray-500">(optional)</span>
                  </>
                }
                error={errors.category}
                value={category}
                onChange={setCategory}
                options={CATEGORY_OPTIONS}
              />
            </DrawerBody>

            <DrawerFooter className="gap-2 sm:flex-row sm:justify-end">
              <DrawerClose asChild>
                <Button variant="secondary" className="py-1.5">
                  Cancel
                </Button>
              </DrawerClose>
              <Button
                className="py-1.5"
                onClick={submit}
                disabled={saving}
                isLoading={saving}
                loadingText="Issuing"
              >
                Issue card
              </Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
