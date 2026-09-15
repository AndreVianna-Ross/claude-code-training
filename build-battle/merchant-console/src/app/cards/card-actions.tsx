"use client"

import { Button } from "@/components/Button"
import { Card, CardStatus } from "@/data/types"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function CardActions({ card }: { card: Card }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (card.status === "cancelled") {
    return <span className="text-sm text-gray-400">—</span>
  }

  const move = async (status: CardStatus) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (response.ok) return router.refresh()
      const payload = await response.json().catch(() => null)
      setError(payload?.message ?? "That did not work.")
    } catch {
      setError("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }

  const frozen = card.status === "frozen"
  const label = frozen ? "Unfreeze" : "Freeze"

  return (
    <div className="flex items-center justify-end gap-2">
      {error && (
        <span role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
      <Button
        variant="secondary"
        className="py-1"
        disabled={busy}
        aria-label={`${label} ${card.nickname}`}
        onClick={() => move(frozen ? "active" : "frozen")}
      >
        {label}
      </Button>
    </div>
  )
}
