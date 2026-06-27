"use client"

import { Map as MapIcon, Radar } from "lucide-react"

import { NAV_ITEMS } from "@/components/bottom-nav"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

const SAFE_NAV_ITEMS = NAV_ITEMS.filter((item) => Boolean(item?.id && item?.icon))

export function DesktopRail() {
  const { activePanel, setActivePanel } = useStore()

  return (
    <div className="flex h-full flex-col items-center gap-1 bg-card/95 px-1.5 py-3 shadow-[18px_0_60px_-42px_rgb(0_0_0/0.55)] backdrop-blur-2xl">
      <span
        className="mb-2 grid size-10 place-items-center rounded-lg"
        style={{ background: "var(--grad-primary)", boxShadow: "var(--glow-primary)" }}
      >
        <Radar className="size-5 text-primary-foreground" />
      </span>

      {SAFE_NAV_ITEMS.map((item) => {
        const active = activePanel === item.id
        const Icon = item.icon ?? MapIcon

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActivePanel(item.id)}
            aria-current={active ? "page" : undefined}
            title={item.label}
            style={active ? { background: "var(--grad-primary)", boxShadow: "var(--glow-primary)" } : {}}
            className={cn(
              "flex w-14 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition-all active:scale-90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
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
