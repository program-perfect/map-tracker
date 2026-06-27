"use client"

import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

export function RouteEditorMenu() {
  const {
    routeEditorActive,
    routeEditorPoints,
    startRouteEditor,
    cancelRouteEditor,
    saveRouteEditor,
    undoRouteEditorPoint,
    clearRouteEditorPoints,
  } = useStore()

  if (!routeEditorActive) return null

  const canSave = routeEditorPoints.length >= 2

  return (
    <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-primary/30 bg-card/95 p-3 text-card-foreground shadow-2xl backdrop-blur-2xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            Редактор маршрута · {routeEditorPoints.length} точ.
          </p>
          <p className="text-xs text-muted-foreground">
            Кликайте по карте: улицы, дома, дворы — точки попадут в маршрут.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button
            type="button"
            onClick={undoRouteEditorPoint}
            disabled={routeEditorPoints.length === 0}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-40"
          >
            Назад
          </button>

          <button
            type="button"
            onClick={clearRouteEditorPoints}
            disabled={routeEditorPoints.length === 0}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-40"
          >
            Очистить
          </button>

          <button
            type="button"
            onClick={cancelRouteEditor}
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/15"
          >
            Отмена
          </button>

          <button
            type="button"
            onClick={saveRouteEditor}
            disabled={!canSave}
            className={cn(
              "rounded-xl px-3 py-2 text-xs font-semibold text-primary-foreground transition-all active:scale-95 disabled:opacity-40",
              canSave ? "hover:brightness-110" : ""
            )}
            style={{ background: "var(--grad-primary)", boxShadow: canSave ? "var(--glow-primary)" : undefined }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}
