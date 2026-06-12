"use client"

import { Map, Boxes, History, Hexagon, Settings } from "lucide-react"
import { useStore } from "@/lib/store"
import type { PanelId } from "@/lib/types"
import { cn } from "@/lib/utils"

export const NAV_ITEMS: { id: PanelId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "map", label: "Карта", icon: Map },
  { id: "objects", label: "Объекты", icon: Boxes },
  { id: "history", label: "История", icon: History },
  { id: "geofences", label: "Геозоны", icon: Hexagon },
  { id: "settings", label: "Настройки", icon: Settings },
]

export function BottomNav() {
  const { activePanel, setActivePanel } = useStore()

  return (
    <nav className="glass pointer-events-auto rounded-2xl p-1.5">
      <ul className="flex items-stretch justify-between gap-1">
        {NAV_ITEMS.map((item) => {
          const active = activePanel === item.id
          const Icon = item.icon
          return (
            <li key={item.id} className="flex-1">
              <button
                type="button"
                onClick={() => setActivePanel(active && item.id !== "map" ? "map" : item.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-all active:scale-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className={cn("size-5 transition-transform", active && "scale-110")} />
                {item.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
