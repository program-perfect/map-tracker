"use client"

import { Radar } from "lucide-react"
import { useStore } from "@/lib/store"
import { NAV_ITEMS } from "@/components/bottom-nav"
import { cn } from "@/lib/utils"

export function DesktopRail() {
  const { activePanel, setActivePanel } = useStore()

  return (
    <div className="flex h-full flex-col items-center gap-1 border-r border-border bg-sidebar py-3">
      <span className="mb-2 grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Radar className="size-5" />
      </span>
      {NAV_ITEMS.map((item) => {
        const active = activePanel === item.id
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActivePanel(item.id)}
            aria-current={active ? "page" : undefined}
            title={item.label}
            className={cn(
              "flex w-16 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-5" />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
