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
        "grid size-10 place-items-center text-foreground transition-colors hover:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-primary text-primary-foreground hover:bg-primary",
      )}
    >
      {children}
    </button>
  )
}

export function MapControls() {
  const { zoom, setZoom, requestCenter, rotationMode, toggleRotationMode } = useStore()

  return (
    <div className="flex flex-col items-end gap-2">
      {/* rotation */}
      <div className="overflow-hidden rounded-xl border border-border bg-card/90 shadow-lg backdrop-blur">
        <CtrlButton
          onClick={toggleRotationMode}
          active={rotationMode === "movement"}
          label={
            rotationMode === "north"
              ? "Поворот: на север (нажмите для следования за точкой)"
              : "Поворот: по движению (нажмите для севера)"
          }
        >
          {rotationMode === "north" ? (
            <Compass className="size-5" />
          ) : (
            <Navigation2 className="size-5" />
          )}
        </CtrlButton>
      </div>

      {/* center on beacon */}
      <div className="overflow-hidden rounded-xl border border-border bg-card/90 shadow-lg backdrop-blur">
        <CtrlButton onClick={() => requestCenter()} label="Центрировать на маяке">
          <LocateFixed className="size-5 text-primary" />
        </CtrlButton>
      </div>

      {/* zoom */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card/90 shadow-lg backdrop-blur">
        <CtrlButton onClick={() => setZoom((z) => z + 1)} label="Приблизить">
          <Plus className="size-5" />
        </CtrlButton>
        <div className="h-px bg-border" />
        <CtrlButton onClick={() => setZoom((z) => z - 1)} label="Отдалить">
          <Minus className="size-5" />
        </CtrlButton>
      </div>
    </div>
  )
}
