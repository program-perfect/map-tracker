"use client"

import { useStore } from "@/lib/store"
import { formatScale, metersPerPixel, niceScaleLength } from "@/lib/geo"

export function ScaleBar() {
  const { zoom, position } = useStore()
  const mpp = metersPerPixel(position[0], zoom)
  const { meters, px } = niceScaleLength(mpp, 90)

  return (
    <div className="pointer-events-none select-none rounded-md border border-border bg-card/80 px-2 py-1 backdrop-blur">
      <div className="flex items-end gap-2">
        <div
          className="relative h-2 border-x border-b border-foreground/70"
          style={{ width: Math.max(28, Math.min(160, px)) }}
        >
          <span className="absolute inset-x-0 bottom-0 h-px bg-foreground/70" />
        </div>
        <span className="text-[11px] font-medium tabular-nums text-foreground">
          {formatScale(meters)}
        </span>
      </div>
    </div>
  )
}
