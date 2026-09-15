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

/**
 * Issue a card, then reveal its number exactly once.
 *
 * The number lives in this component's state and nowhere else, and closing the
 * drawer clears it (.claude/rules/cards.md: "not left in client state after
 * the success screen closes"). It cannot be fetched again — no other endpoint
 * returns it, and the card record has no field for it.
 */

const NONE = "__none__"

type Merchant = { id: string; name: string; currency: Currency }

/** A labelled control with its error. Four of these, so it is worth a name. */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-sm font-medium text-gray-900 dark:text-gray-50"
      >
        {label}
        {hint && <span className="font-normal text-gray-500"> {hint}</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

/** A Select over [value, label] pairs. Three of these in this form. */
function Choice({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: readonly (readonly [string, string])[]
  placeholder?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(([optionValue, optionLabel]) => (
          <SelectItem key={optionValue} value={optionValue}>
            {optionLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function IssueCardDialog({ merchants }: { merchants: Merchant[] }) {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [nickname, setNickname] = useState("")
  const [merchantId, setMerchantId] = useState("")
  const [limit, setLimit] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [category, setCategory] = useState<string>(NONE)

  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [issued, setIssued] = useState<{ card: Card; number: string } | null>(
    null,
  )
  // Held across retries so a resubmitted form cannot mint a second card. A new
  // key is drawn only once the drawer closes.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const selected = merchants.find((entry) => entry.id === merchantId) ?? null
  // A card settles where its merchant settles, and the server enforces it, so
  // the control offers only what would be accepted rather than inviting a 400.
  const currencies = selected ? [selected.currency] : CARD_CURRENCIES

  const reset = () => {
    setNickname("")
    setMerchantId("")
    setLimit("")
    setCurrency("USD")
    setCategory(NONE)
    setErrors({})
    setFormError(null)
    setIssued(null) // the reveal does not survive the drawer closing
    setRequestId(crypto.randomUUID())
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  const submit = async () => {
    setSaving(true)
    setErrors({})
    setFormError(null)

    // The decimal a human typed becomes minor units once, here at the edge.
    // The server re-checks it: this is convenience, not enforcement.
    const spendLimit = parseAmountToMinorUnits(limit)
    if (spendLimit === null) {
      setErrors({ spendLimit: "Enter an amount like 250 or 250.00." })
      setSaving(false)
      return
    }

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
      router.refresh() // the list behind the drawer picks up the new card
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
        {issued ? (
          <>
            <DrawerHeader>
              <DrawerTitle>Card issued</DrawerTitle>
              <DrawerDescription>
                This is the only time the full number is shown. Copy it now —
                afterwards only the last four is kept.
              </DrawerDescription>
            </DrawerHeader>

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
            <DrawerHeader>
              <DrawerTitle>Issue a virtual card</DrawerTitle>
              <DrawerDescription>
                Single merchant, with a limit from the moment it exists.
              </DrawerDescription>
            </DrawerHeader>

            <DrawerBody className="space-y-4">
              {formError && (
                <p
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
                >
                  {formError}
                </p>
              )}

              <Field id="card-nickname" label="Nickname" error={errors.nickname}>
                <Input
                  id="card-nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="Google Ads"
                  hasError={Boolean(errors.nickname)}
                  aria-describedby={
                    errors.nickname ? "card-nickname-error" : undefined
                  }
                />
              </Field>

              <Field id="card-merchant" label="Merchant" error={errors.merchantId}>
                <Choice
                  id="card-merchant"
                  value={merchantId}
                  placeholder="Choose a merchant"
                  options={merchants.map((m) => [m.id, m.name] as const)}
                  onChange={(value) => {
                    setMerchantId(value)
                    const merchant = merchants.find((m) => m.id === value)
                    if (merchant) setCurrency(merchant.currency)
                  }}
                />
              </Field>

              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <Field id="card-limit" label="Spend limit" error={errors.spendLimit}>
                  <Input
                    id="card-limit"
                    inputMode="decimal"
                    value={limit}
                    onChange={(event) => setLimit(event.target.value)}
                    placeholder="2500.00"
                    hasError={Boolean(errors.spendLimit)}
                    aria-describedby={
                      errors.spendLimit ? "card-limit-error" : undefined
                    }
                  />
                </Field>
                <Field id="card-currency" label="Currency" error={errors.currency}>
                  <Choice
                    id="card-currency"
                    value={currency}
                    options={currencies.map((code) => [code, code] as const)}
                    onChange={(value) => setCurrency(value as Currency)}
                  />
                </Field>
              </div>
              {selected && (
                <p className="-mt-2 text-sm text-gray-500">
                  {selected.name} settles in {selected.currency}, so the card
                  does too.
                </p>
              )}

              <Field
                id="card-category"
                label="Category lock"
                hint="(optional)"
                error={errors.category}
              >
                <Choice
                  id="card-category"
                  value={category}
                  onChange={setCategory}
                  options={[
                    [NONE, "No lock"] as const,
                    ...CARD_CATEGORIES.map(
                      (value) => [value, CARD_CATEGORY_LABELS[value]] as const,
                    ),
                  ]}
                />
              </Field>
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
