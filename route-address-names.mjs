import fs from "node:fs"

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Cannot find block: ${label}`)
  }
  return content.replace(search, replacement)
}

const storeFile = "lib/store.tsx"
const menuFile = "components/route-editor-menu.tsx"
const settingsFile = "components/panels/settings-panel.tsx"

let store = fs.readFileSync(storeFile, "utf8").replace(/\r\n/g, "\n")
let settings = fs.readFileSync(settingsFile, "utf8").replace(/\r\n/g, "\n")

// ---------- lib/store.tsx ----------

if (!store.includes("routeEditorEditingId: string | null")) {
  store = replaceOnce(
    store,
    `  routeEditorActive: boolean
  routeEditorPoints: LatLng[]`,
    `  routeEditorActive: boolean
  routeEditorPoints: LatLng[]
  routeEditorEditingId: string | null`,
    "StoreValue routeEditorEditingId"
  )
}

if (!store.includes("renameSavedRoute:")) {
  store = replaceOnce(
    store,
    `  applySavedRoute: (routeId: string, autoMove?: boolean) => void
  deleteSavedRoute: (routeId: string) => void`,
    `  applySavedRoute: (routeId: string, autoMove?: boolean) => void
  renameSavedRoute: (routeId: string, name: string) => void
  deleteSavedRoute: (routeId: string) => void`,
    "StoreValue renameSavedRoute"
  )
}

if (!store.includes("const renameSavedRoute = useCallback")) {
  store = replaceOnce(
    store,
    `  const deleteSavedRoute = useCallback((routeId: string) => {`,
    `  const renameSavedRoute = useCallback((routeId: string, name: string) => {
    const safeName = name.trim() || "Маршрут"

    setSavedRoutes((prev) => {
      const next = prev.map((route) =>
        route.id === routeId
          ? { ...route, name: safeName, updatedAt: Date.now() }
          : route
      )

      writePersistedSavedRoutes(next)
      savedRoutesRef.current = next
      return next
    })
  }, [])

  const deleteSavedRoute = useCallback((routeId: string) => {`,
    "renameSavedRoute callback"
  )
}

if (!store.includes("    routeEditorEditingId,")) {
  store = replaceOnce(
    store,
    `    routeEditorActive,
    routeEditorPoints,`,
    `    routeEditorActive,
    routeEditorPoints,
    routeEditorEditingId,`,
    "store value routeEditorEditingId"
  )
}

if (!store.includes("    renameSavedRoute,")) {
  store = replaceOnce(
    store,
    `    applySavedRoute,
    deleteSavedRoute,`,
    `    applySavedRoute,
    renameSavedRoute,
    deleteSavedRoute,`,
    "store value renameSavedRoute"
  )
}

store = store.replace(
  `routeEditorActive, routeEditorPoints, savedRoutes, activeRouteId, startRouteEditor`,
  `routeEditorActive, routeEditorPoints, routeEditorEditingId, savedRoutes, activeRouteId, startRouteEditor`
)

store = store.replace(
  `clearRouteEditorPoints, applySavedRoute, deleteSavedRoute, updateRoutePointsText`,
  `clearRouteEditorPoints, applySavedRoute, renameSavedRoute, deleteSavedRoute, updateRoutePointsText`
)

// ---------- components/route-editor-menu.tsx ----------

const routeEditorMenu = `"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function compactAddress(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback

  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== "Россия" && part !== "Российская Федерация")
    .filter((part) => !/^\\d{5,6}$/.test(part))

  if (parts.length >= 3) return parts.slice(-2).join(", ")
  if (parts.length >= 1) return parts.slice(-2).join(", ")

  return fallback
}

async function reverseGeocodePoint(point: [number, number], fallback: string) {
  const ymaps = (window as any).ymaps

  if (!ymaps?.geocode) return fallback

  try {
    const result = await ymaps.geocode(point, { results: 1 })
    const geoObject = result.geoObjects.get(0)
    const props = geoObject?.properties

    const name = props?.get("name")
    const text = props?.get("text")

    return compactAddress(name || text, fallback)
  } catch {
    return fallback
  }
}

export function RouteEditorMenu() {
  const {
    settings,
    routeEditorActive,
    routeEditorPoints,
    routeEditorEditingId,
    savedRoutes,
    cancelRouteEditor,
    saveRouteEditor,
    undoRouteEditorPoint,
    clearRouteEditorPoints,
  } = useStore()

  const editedRoute = useMemo(
    () => savedRoutes.find((route) => route.id === routeEditorEditingId) ?? null,
    [routeEditorEditingId, savedRoutes]
  )

  const [configOpen, setConfigOpen] = useState(false)
  const [name, setName] = useState("Новый маршрут")
  const [nameTouched, setNameTouched] = useState(false)
  const [nameResolving, setNameResolving] = useState(false)
  const [stepMeters, setStepMeters] = useState(settings.stepMeters ?? 5)
  const [intervalMs, setIntervalMs] = useState(settings.intervalMs ?? 1000)
  const [autoMove, setAutoMove] = useState(false)
  const [routeLoop, setRouteLoop] = useState(settings.routeLoop ?? false)
  const lastAutoNameKeyRef = useRef("")

  useEffect(() => {
    if (!routeEditorActive) {
      setConfigOpen(false)
      setNameTouched(false)
      setNameResolving(false)
      lastAutoNameKeyRef.current = ""
      return
    }

    setName(editedRoute?.name ?? "Новый маршрут")
    setNameTouched(Boolean(editedRoute))
    setStepMeters(editedRoute?.stepMeters ?? settings.stepMeters ?? 5)
    setIntervalMs(editedRoute?.intervalMs ?? settings.intervalMs ?? 1000)
    setRouteLoop(editedRoute?.routeLoop ?? settings.routeLoop ?? false)
    setAutoMove(false)
    lastAutoNameKeyRef.current = ""
  }, [editedRoute, routeEditorActive, routeEditorEditingId, settings.intervalMs, settings.routeLoop, settings.stepMeters])

  useEffect(() => {
    if (!routeEditorActive) return
    if (routeEditorEditingId) return
    if (nameTouched) return
    if (routeEditorPoints.length < 2) return

    const first = routeEditorPoints[0]
    const last = routeEditorPoints[routeEditorPoints.length - 1]
    const key = \`\${first[0]},\${first[1]}|\${last[0]},\${last[1]}\`

    if (lastAutoNameKeyRef.current === key) return
    lastAutoNameKeyRef.current = key

    let cancelled = false

    async function resolveName() {
      setNameResolving(true)

      const firstFallback = \`\${first[0].toFixed(5)}, \${first[1].toFixed(5)}\`
      const lastFallback = \`\${last[0].toFixed(5)}, \${last[1].toFixed(5)}\`

      const [from, to] = await Promise.all([
        reverseGeocodePoint(first, firstFallback),
        reverseGeocodePoint(last, lastFallback),
      ])

      if (cancelled) return

      setName(\`\${from} → \${to}\`)
      setNameResolving(false)
    }

    resolveName()

    return () => {
      cancelled = true
    }
  }, [nameTouched, routeEditorActive, routeEditorEditingId, routeEditorPoints])

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
              ПКМ по карте добавляет точку маршрута. Название возьмётся из адресов первой и последней точки.
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
              Название можно поменять вручную перед сохранением. Точки маршрута: {routeEditorPoints.length}.
            </p>

            <div className="mt-5 space-y-4">
              <label className="block space-y-1.5">
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span>Название маршрута</span>
                  {nameResolving && (
                    <span className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                      ищу адреса…
                    </span>
                  )}
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    setNameTouched(true)
                  }}
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
`

fs.writeFileSync(menuFile, routeEditorMenu, "utf8")

// ---------- components/panels/settings-panel.tsx ----------

if (!settings.includes("renameSavedRoute,")) {
  settings = settings.replace(
    `    applySavedRoute,
    deleteSavedRoute,`,
    `    applySavedRoute,
    renameSavedRoute,
    deleteSavedRoute,`
  )
}

settings = settings.replace(
  `<p className="truncate text-sm font-semibold">
                          {route.name}
                        </p>`,
  `<input
                          type="text"
                          defaultValue={route.name}
                          onBlur={(event) => renameSavedRoute(route.id, event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur()
                          }}
                          className="h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold outline-none transition-colors hover:border-border hover:bg-card focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/20"
                          aria-label={\`Название маршрута \${route.name}\`}
                        />`
)

fs.writeFileSync(storeFile, store, "utf8")
fs.writeFileSync(settingsFile, settings, "utf8")

console.log("Route names now auto-resolve from first and last addresses and can be edited later")
