"use client"

import { Plus, Minus, LocateFixed, Compass, Navigation2 } from "lucide-react"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

function CtrlButton({
  children,
  onClick,
  label,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "relative grid size-10 place-items-center text-foreground transition-all hover:bg-accent active:scale-90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "text-primary-foreground",
      )}
      style={active ? { background: "var(--grad-primary)", boxShadow: "var(--glow-primary)" } : {}}
    >
      {children}
    </button>
  )
}

export function MapControls() {
  const { zoom, setZoom, requestCenter, rotationMode, toggleRotationMode } = useStore()

  return (
    <div className="relative z-30 flex animate-fade-in flex-col items-end">
      <div className="glass isolate flex flex-col overflow-hidden rounded-xl shadow-lg">
        <CtrlButton
          onClick={toggleRotationMode}
          active={rotationMode === "movement"}
          label={
            rotationMode === "north"
              ? "Поворот: на север"
              : "Поворот: по движению"
          }
        >
          {rotationMode === "north" ? (
            <Compass className="size-5" />
          ) : (
            <Navigation2 className="size-5" />
          )}
        </CtrlButton>

        <div className="h-px bg-border/70" />

        <CtrlButton onClick={() => requestCenter()} label="Центрировать на маяке">
          <LocateFixed className="size-5 text-primary" />
        </CtrlButton>

        <div className="h-px bg-border/70" />

        <CtrlButton onClick={() => setZoom((z) => z + 1)} label="Приблизить">
          <Plus className="size-5" />
        </CtrlButton>

        <div className="h-px bg-border/70" />

        <CtrlButton onClick={() => setZoom((z) => z - 1)} label="Отдалить">
          <Minus className="size-5" />
        </CtrlButton>
      </div>
    </div>
  )
}
