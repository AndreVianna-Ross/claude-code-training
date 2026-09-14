"use client"

import { Button } from "@/components/Button"
import { Card, CardStatus } from "@/data/types"
import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Freeze, unfreeze and cancel from the list, without a full page reload:
 * router.refresh() re-renders the server component in place.
 *
 * The server owns the state machine — this only offers the moves that are
 * legal from where the card is, and a refused move surfaces its reason.
 * Cancelling is irreversible, so it asks first.
 */
export function CardActions({ card }: { card: Card }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  // cancelled is terminal, so there is nothing to offer.
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
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setError(payload?.message ?? "That did not work.")
        return
      }
      setConfirming(false)
      router.refresh()
    } catch {
      setError("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-gray-500">Cancel for good?</span>
        <Button
          variant="secondary"
          className="py-1"
          disabled={busy}
          onClick={() => setConfirming(false)}
        >
          Keep
        </Button>
        <Button
          variant="destructive"
          className="py-1"
          disabled={busy}
          onClick={() => move("cancelled")}
        >
          Cancel card
        </Button>
      </div>
    )
  }

  const frozen = card.status === "frozen"

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
        onClick={() => move(frozen ? "active" : "frozen")}
      >
        {frozen ? "Unfreeze" : "Freeze"}
      </Button>
      <Button
        variant="ghost"
        className="py-1 text-red-600 hover:text-red-700 dark:text-red-400"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        Cancel
      </Button>
    </div>
  )
}
