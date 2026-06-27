"use client"

import { useMemo, useState } from "react"

import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function RouteEditorMenu() {
  const {
    settings,
    routeEditorActive,
    routeEditorPoints,
    savedRoutes,
    activeRouteId,
    cancelRouteEditor,
    saveRouteEditor,
    undoRouteEditorPoint,
    clearRouteEditorPoints,
  } = useStore()

  const editedRoute = useMemo(
    () => savedRoutes.find((route) => route.id === activeRouteId) ?? null,
    [activeRouteId, savedRoutes]
  )

  const [configOpen, setConfigOpen] = useState(false)
  const [name, setName] = useState(editedRoute?.name ?? "Новый маршрут")
  const [stepMeters, setStepMeters] = useState(settings.stepMeters ?? 5)
  const [intervalMs, setIntervalMs] = useState(settings.intervalMs ?? 1000)
  const [autoMove, setAutoMove] = useState(false)
  const [routeLoop, setRouteLoop] = useState(settings.routeLoop ?? false)

  if (!routeEditorActive) return null

  const canSave = routeEditorPoints.length >= 2
  const safeStepMeters = clampNumber(stepMeters, 1, 30_000, settings.stepMeters ?? 5)
  const safeIntervalMs = clampNumber(intervalMs, 1, 300_000, settings.intervalMs ?? 1000)

  return (
    <>
      <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-primary/30 bg-card/95 p-3 text-card-foreground shadow-2xl backdrop-blur-2xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              Редактор маршрута · {routeEditorPoints.length} точ.
            </p>
            <p className="text-xs text-muted-foreground">
              ПКМ по карте добавляет точку маршрута. Потом сохраните маршрут в список.
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
              onClick={() => {
                setConfigOpen(false)
                cancelRouteEditor()
              }}
              className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/15"
            >
              Отмена
            </button>

            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              disabled={!canSave}
              className={cn(
                "rounded-xl px-3 py-2 text-xs font-semibold text-primary-foreground transition-all active:scale-95 disabled:opacity-40",
                canSave ? "hover:brightness-110" : ""
              )}
              style={{ background: "var(--grad-primary)", boxShadow: canSave ? "var(--glow-primary)" : undefined }}
            >
              Далее
            </button>
          </div>
        </div>
      </div>

      {configOpen && (
        <div className="pointer-events-auto fixed inset-0 z-[1100] grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-editor-config-title"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl"
          >
            <h2 id="route-editor-config-title" className="text-base font-semibold">
              Параметры маршрута
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Настройте имя, шаг и тайминг. Точки маршрута: {routeEditorPoints.length}.
            </p>

            <div className="mt-5 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Название маршрута</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                  placeholder="Например: Дом → Купидон"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Шаг перемещения, м</span>
                <input
                  type="number"
                  min={1}
                  max={30000}
                  step={1}
                  value={safeStepMeters}
                  onChange={(event) => setStepMeters(Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/25"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Интервал между шагами, мс</span>
                <input
                  type="number"
                  min={1}
                  max={300000}
                  step={100}
                  value={safeIntervalMs}
                  onChange={(event) => setIntervalMs(Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/25"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-background px-3 py-2.5">
                <span>
                  <span className="block text-sm font-medium">Запустить движение после сохранения</span>
                  <span className="block text-xs text-muted-foreground">Если выключено — маршрут сохранится, но точка будет стоять.</span>
                </span>
                <input type="checkbox" checked={autoMove} onChange={(event) => setAutoMove(event.target.checked)} className="size-4" />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-background px-3 py-2.5">
                <span>
                  <span className="block text-sm font-medium">Зациклить маршрут</span>
                  <span className="block text-xs text-muted-foreground">После последней точки вернуться к первой.</span>
                </span>
                <input type="checkbox" checked={routeLoop} onChange={(event) => setRouteLoop(event.target.checked)} className="size-4" />
              </label>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                Назад
              </button>

              <button
                type="button"
                onClick={() => {
                  saveRouteEditor({
                    name,
                    stepMeters: safeStepMeters,
                    intervalMs: safeIntervalMs,
                    autoMove,
                    routeLoop,
                  })
                  setConfigOpen(false)
                }}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: "var(--grad-primary)", boxShadow: "var(--glow-primary)" }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
