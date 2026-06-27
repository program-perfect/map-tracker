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
let menu = fs.readFileSync(menuFile, "utf8").replace(/\r\n/g, "\n")
let settings = fs.readFileSync(settingsFile, "utf8").replace(/\r\n/g, "\n")

// ---------- lib/store.tsx ----------

const savedRouteType = `type SavedRoute = {
  id: string
  name: string
  points: LatLng[]
  sourcePoints?: LatLng[]
  interpolationEnabled?: boolean
  interpolationFactor?: number
  sourceStepMeters?: number
  sourceIntervalMs?: number
  generatedStepMeters?: number
  generatedIntervalMs?: number
  stepMeters: number
  intervalMs: number
  routeLoop: boolean
  createdAt: number
  updatedAt: number
}

type RouteEditorSaveOptions = {
  name?: string
  stepMeters?: number
  intervalMs?: number
  autoMove?: boolean
  routeLoop?: boolean
  interpolationEnabled?: boolean
  interpolationFactor?: number
  sourceStepMeters?: number
  sourceIntervalMs?: number
  generatedStepMeters?: number
  generatedIntervalMs?: number
}`

store = store.replace(/type SavedRoute = \{[\s\S]*?\n\}\n\ntype RouteEditorSaveOptions = \{[\s\S]*?\n\}/, savedRouteType)

if (!store.includes("function clampRouteNumber")) {
  store = replaceOnce(
    store,
    `function formatRoutePoints(points: LatLng[]) {`,
    `function clampRouteNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, Math.round(number)))
}

function interpolateRoutePoints(points: LatLng[], factor: number) {
  const safeFactor = clampRouteNumber(factor, 0, 25, 0)
  if (points.length < 2 || safeFactor <= 0) return points

  const next: LatLng[] = []

  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i]
    const to = points[i + 1]

    next.push(from)

    for (let j = 1; j <= safeFactor; j += 1) {
      const t = j / (safeFactor + 1)
      next.push([
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
      ])
    }
  }

  next.push(points[points.length - 1])
  return next
}

function buildSavedRoutePoints(sourcePoints: LatLng[], interpolationEnabled?: boolean, interpolationFactor?: number) {
  return interpolationEnabled
    ? interpolateRoutePoints(sourcePoints, interpolationFactor ?? 0)
    : sourcePoints
}

function formatRoutePoints(points: LatLng[]) {`,
    "route interpolation helpers"
  )
}

store = store.replace(
  `points: KZ_SPB_ROUTE_POINTS,
    stepMeters: DEFAULT_SETTINGS.stepMeters,
    intervalMs: DEFAULT_SETTINGS.intervalMs,`,
  `points: KZ_SPB_ROUTE_POINTS,
    sourcePoints: KZ_SPB_ROUTE_POINTS,
    interpolationEnabled: false,
    interpolationFactor: 0,
    sourceStepMeters: DEFAULT_SETTINGS.stepMeters,
    sourceIntervalMs: DEFAULT_SETTINGS.intervalMs,
    generatedStepMeters: DEFAULT_SETTINGS.stepMeters,
    generatedIntervalMs: DEFAULT_SETTINGS.intervalMs,
    stepMeters: DEFAULT_SETTINGS.stepMeters,
    intervalMs: DEFAULT_SETTINGS.intervalMs,`
)

store = store.replace(
  `return {
    id: route.id,
    name: typeof route.name === "string" && route.name.trim() ? route.name.trim() : "Маршрут",
    points,
    stepMeters: Math.max(1, Math.min(30_000, Math.round(route.stepMeters ?? DEFAULT_SETTINGS.stepMeters))),
    intervalMs: Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.round(route.intervalMs ?? DEFAULT_SETTINGS.intervalMs))),
    routeLoop: Boolean(route.routeLoop),
    createdAt: typeof route.createdAt === "number" ? route.createdAt : now,
    updatedAt: typeof route.updatedAt === "number" ? route.updatedAt : now,
  }`,
  `const sourcePoints = Array.isArray(route.sourcePoints)
    ? route.sourcePoints.filter((point): point is LatLng => (
        Array.isArray(point) &&
        point.length === 2 &&
        typeof point[0] === "number" &&
        typeof point[1] === "number" &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]) &&
        Math.abs(point[0]) <= 90 &&
        Math.abs(point[1]) <= 180
      ))
    : points

  const interpolationEnabled = Boolean(route.interpolationEnabled)
  const interpolationFactor = clampRouteNumber(route.interpolationFactor, 0, 25, 0)
  const sourceStepMeters = clampRouteNumber(route.sourceStepMeters ?? route.stepMeters, 1, 30_000, DEFAULT_SETTINGS.stepMeters)
  const sourceIntervalMs = clampRouteNumber(route.sourceIntervalMs ?? route.intervalMs, MIN_INTERVAL_MS, MAX_INTERVAL_MS, DEFAULT_SETTINGS.intervalMs)
  const generatedStepMeters = clampRouteNumber(route.generatedStepMeters ?? route.stepMeters, 1, 30_000, sourceStepMeters)
  const generatedIntervalMs = clampRouteNumber(route.generatedIntervalMs ?? route.intervalMs, MIN_INTERVAL_MS, MAX_INTERVAL_MS, sourceIntervalMs)
  const builtPoints = buildSavedRoutePoints(sourcePoints.length >= 2 ? sourcePoints : points, interpolationEnabled, interpolationFactor)

  return {
    id: route.id,
    name: typeof route.name === "string" && route.name.trim() ? route.name.trim() : "Маршрут",
    points: builtPoints,
    sourcePoints: sourcePoints.length >= 2 ? sourcePoints : points,
    interpolationEnabled,
    interpolationFactor,
    sourceStepMeters,
    sourceIntervalMs,
    generatedStepMeters,
    generatedIntervalMs,
    stepMeters: interpolationEnabled ? generatedStepMeters : sourceStepMeters,
    intervalMs: interpolationEnabled ? generatedIntervalMs : sourceIntervalMs,
    routeLoop: Boolean(route.routeLoop),
    createdAt: typeof route.createdAt === "number" ? route.createdAt : now,
    updatedAt: typeof route.updatedAt === "number" ? route.updatedAt : now,
  }`
)

store = store.replace(
  `const safeStepMeters = Math.max(1, Math.min(30_000, Math.round(options?.stepMeters ?? existing?.stepMeters ?? settingsRef.current.stepMeters ?? 5)))
    const safeIntervalMs = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.round(options?.intervalMs ?? existing?.intervalMs ?? settingsRef.current.intervalMs ?? DEFAULT_INTERVAL_MS)))
    const routeLoop = options?.routeLoop ?? existing?.routeLoop ?? settingsRef.current.routeLoop ?? false
    const routeName = (options?.name ?? existing?.name ?? \`Маршрут \${savedRoutesRef.current.length + 1}\`).trim() || "Маршрут"
    const routeId = existing?.id ?? uid()
    const start = points[0]

    const savedRoute: SavedRoute = {
      id: routeId,
      name: routeName,
      points,
      stepMeters: safeStepMeters,
      intervalMs: safeIntervalMs,
      routeLoop,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }`,
  `const interpolationEnabled = options?.interpolationEnabled ?? existing?.interpolationEnabled ?? false
    const interpolationFactor = clampRouteNumber(options?.interpolationFactor ?? existing?.interpolationFactor ?? 0, 0, 25, 0)

    const sourceStepMeters = clampRouteNumber(
      options?.sourceStepMeters ?? options?.stepMeters ?? existing?.sourceStepMeters ?? existing?.stepMeters ?? settingsRef.current.stepMeters ?? 5,
      1,
      30_000,
      5
    )
    const sourceIntervalMs = clampRouteNumber(
      options?.sourceIntervalMs ?? options?.intervalMs ?? existing?.sourceIntervalMs ?? existing?.intervalMs ?? settingsRef.current.intervalMs ?? DEFAULT_INTERVAL_MS,
      MIN_INTERVAL_MS,
      MAX_INTERVAL_MS,
      DEFAULT_INTERVAL_MS
    )
    const generatedStepMeters = clampRouteNumber(
      options?.generatedStepMeters ?? existing?.generatedStepMeters ?? sourceStepMeters,
      1,
      30_000,
      sourceStepMeters
    )
    const generatedIntervalMs = clampRouteNumber(
      options?.generatedIntervalMs ?? existing?.generatedIntervalMs ?? sourceIntervalMs,
      MIN_INTERVAL_MS,
      MAX_INTERVAL_MS,
      sourceIntervalMs
    )

    const safeStepMeters = interpolationEnabled ? generatedStepMeters : sourceStepMeters
    const safeIntervalMs = interpolationEnabled ? generatedIntervalMs : sourceIntervalMs
    const routeLoop = options?.routeLoop ?? existing?.routeLoop ?? settingsRef.current.routeLoop ?? false
    const routeName = (options?.name ?? existing?.name ?? \`Маршрут \${savedRoutesRef.current.length + 1}\`).trim() || "Маршрут"
    const routeId = existing?.id ?? uid()
    const sourcePoints = points
    const builtPoints = buildSavedRoutePoints(sourcePoints, interpolationEnabled, interpolationFactor)
    const start = builtPoints[0]

    const savedRoute: SavedRoute = {
      id: routeId,
      name: routeName,
      points: builtPoints,
      sourcePoints,
      interpolationEnabled,
      interpolationFactor,
      sourceStepMeters,
      sourceIntervalMs,
      generatedStepMeters,
      generatedIntervalMs,
      stepMeters: safeStepMeters,
      intervalMs: safeIntervalMs,
      routeLoop,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }`
)

store = store.replaceAll(
  `setRoutePointsText(formatRoutePoints(points))
    setRoutePoints(points)
    routePointsRef.current = points`,
  `setRoutePointsText(formatRoutePoints(builtPoints))
    setRoutePoints(builtPoints)
    routePointsRef.current = builtPoints`
)

store = store.replaceAll(
  `note: \`Сохранён маршрут «\${routeName}»: \${points.length} точ., шаг \${safeStepMeters} м, интервал \${safeIntervalMs} мс\`,`,
  `note: \`Сохранён маршрут «\${routeName}»: \${sourcePoints.length} исходн. точ., \${builtPoints.length} итог. точ., шаг \${safeStepMeters} м, интервал \${safeIntervalMs} мс\`,`
)

store = store.replace(
  `const initialPoints = Array.isArray(points) ? points.filter(Boolean) : []`,
  `const initialPoints = Array.isArray(points) ? points.filter(Boolean) : []`
)

fs.writeFileSync(storeFile, store, "utf8")

// ---------- components/route-editor-menu.tsx ----------

const nextMenu = `"use client"

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

  const [interpolationEnabled, setInterpolationEnabled] = useState(false)
  const [interpolationFactor, setInterpolationFactor] = useState(2)

  const [sourceStepMeters, setSourceStepMeters] = useState(settings.stepMeters ?? 5)
  const [sourceIntervalMs, setSourceIntervalMs] = useState(settings.intervalMs ?? 1000)
  const [generatedStepMeters, setGeneratedStepMeters] = useState(settings.stepMeters ?? 5)
  const [generatedIntervalMs, setGeneratedIntervalMs] = useState(settings.intervalMs ?? 1000)

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

    setInterpolationEnabled(editedRoute?.interpolationEnabled ?? false)
    setInterpolationFactor(editedRoute?.interpolationFactor ?? 2)

    setSourceStepMeters(editedRoute?.sourceStepMeters ?? editedRoute?.stepMeters ?? settings.stepMeters ?? 5)
    setSourceIntervalMs(editedRoute?.sourceIntervalMs ?? editedRoute?.intervalMs ?? settings.intervalMs ?? 1000)
    setGeneratedStepMeters(editedRoute?.generatedStepMeters ?? editedRoute?.stepMeters ?? settings.stepMeters ?? 5)
    setGeneratedIntervalMs(editedRoute?.generatedIntervalMs ?? editedRoute?.intervalMs ?? settings.intervalMs ?? 1000)

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

  const safeInterpolationFactor = clampNumber(interpolationFactor, 0, 25, 2)

  const safeSourceStepMeters = clampNumber(sourceStepMeters, 1, 30_000, settings.stepMeters ?? 5)
  const safeSourceIntervalMs = clampNumber(sourceIntervalMs, 1, 300_000, settings.intervalMs ?? 1000)

  const safeGeneratedStepMeters = clampNumber(generatedStepMeters, 1, 30_000, safeSourceStepMeters)
  const safeGeneratedIntervalMs = clampNumber(generatedIntervalMs, 1, 300_000, safeSourceIntervalMs)

  const sourcePointCount = routeEditorPoints.length
  const generatedPointCount = interpolationEnabled && sourcePointCount >= 2
    ? Math.max(0, (sourcePointCount - 1) * safeInterpolationFactor)
    : 0
  const finalPointCount = sourcePointCount + generatedPointCount

  return (
    <>
      <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-primary/30 bg-card/95 p-3 text-card-foreground shadow-2xl backdrop-blur-2xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              Редактор маршрута · {sourcePointCount} исходн. точ.
            </p>
            <p className="text-xs text-muted-foreground">
              ПКМ по карте добавляет исходную точку. Достроенные точки добавятся при сохранении.
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
        <div className="pointer-events-auto fixed inset-0 z-[1100] grid place-items-center overflow-y-auto bg-black/40 px-4 py-5 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-editor-config-title"
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl"
          >
            <h2 id="route-editor-config-title" className="text-base font-semibold">
              Параметры маршрута
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Исходные точки — поставленные вручную. Достроенные точки — автоматически добавленные между ними для более плавной кривой.
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

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-background px-3 py-2.5">
                <span>
                  <span className="block text-sm font-medium">Достраивать точки между исходными</span>
                  <span className="block text-xs text-muted-foreground">
                    Сейчас: {sourcePointCount} исходн. + {generatedPointCount} достр. = {finalPointCount} точ.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={interpolationEnabled}
                  onChange={(event) => setInterpolationEnabled(event.target.checked)}
                  className="size-4"
                />
              </label>

              <label className={interpolationEnabled ? "block space-y-1.5" : "block space-y-1.5 opacity-40 pointer-events-none"}>
                <span className="text-sm font-medium">Коэффициент достраивания</span>
                <input
                  type="number"
                  min={0}
                  max={25}
                  step={1}
                  value={safeInterpolationFactor}
                  disabled={!interpolationEnabled}
                  onChange={(event) => setInterpolationFactor(Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/25"
                />
                <span className="block text-xs text-muted-foreground">
                  Сколько дополнительных точек вставлять между каждыми двумя исходными точками.
                </span>
              </label>

              <div className="rounded-xl border border-border bg-background/60 p-3">
                <h3 className="text-sm font-semibold">Исходные точки</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Эти параметры сохраняются для точек, которые пользователь поставил сам.
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium">Шаг, м</span>
                    <input
                      type="number"
                      min={1}
                      max={30000}
                      step={1}
                      value={safeSourceStepMeters}
                      onChange={(event) => setSourceStepMeters(Number(event.target.value))}
                      className="h-10 w-full rounded-lg border border-border bg-card px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/25"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium">Время шага, мс</span>
                    <input
                      type="number"
                      min={1}
                      max={300000}
                      step={100}
                      value={safeSourceIntervalMs}
                      onChange={(event) => setSourceIntervalMs(Number(event.target.value))}
                      className="h-10 w-full rounded-lg border border-border bg-card px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/25"
                    />
                  </label>
                </div>
              </div>

              <div className={interpolationEnabled ? "rounded-xl border border-primary/30 bg-primary/5 p-3" : "rounded-xl border border-border bg-background/60 p-3 opacity-40 pointer-events-none"}>
                <h3 className="text-sm font-semibold">Достроенные точки</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Эти параметры будут применяться как рабочий темп движения по сглаженному маршруту.
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium">Шаг, м</span>
                    <input
                      type="number"
                      min={1}
                      max={30000}
                      step={1}
                      value={safeGeneratedStepMeters}
                      disabled={!interpolationEnabled}
                      onChange={(event) => setGeneratedStepMeters(Number(event.target.value))}
                      className="h-10 w-full rounded-lg border border-border bg-card px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/25"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium">Время шага, мс</span>
                    <input
                      type="number"
                      min={1}
                      max={300000}
                      step={100}
                      value={safeGeneratedIntervalMs}
                      disabled={!interpolationEnabled}
                      onChange={(event) => setGeneratedIntervalMs(Number(event.target.value))}
                      className="h-10 w-full rounded-lg border border-border bg-card px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/25"
                    />
                  </label>
                </div>
              </div>

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
                    autoMove,
                    routeLoop,
                    interpolationEnabled,
                    interpolationFactor: safeInterpolationFactor,
                    sourceStepMeters: safeSourceStepMeters,
                    sourceIntervalMs: safeSourceIntervalMs,
                    generatedStepMeters: safeGeneratedStepMeters,
                    generatedIntervalMs: safeGeneratedIntervalMs,
                    stepMeters: interpolationEnabled ? safeGeneratedStepMeters : safeSourceStepMeters,
                    intervalMs: interpolationEnabled ? safeGeneratedIntervalMs : safeSourceIntervalMs,
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

fs.writeFileSync(menuFile, nextMenu, "utf8")

// ---------- components/panels/settings-panel.tsx ----------

settings = settings.replace(
  `{route.points.length} точ. · шаг {route.stepMeters} м · {route.intervalMs} мс`,
  `{route.sourcePoints?.length ?? route.points.length} исходн. · {route.points.length} итог. · шаг {route.stepMeters} м · {route.intervalMs} мс`
)

settings = settings.replace(
  `startRouteEditor(route.points, route.id)`,
  `startRouteEditor(route.sourcePoints ?? route.points, route.id)`
)

fs.writeFileSync(settingsFile, settings, "utf8")

console.log("Route interpolation settings added")
