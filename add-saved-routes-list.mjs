import fs from "node:fs"

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Cannot find block: ${label}`)
  }
  return content.replace(search, replacement)
}

const storeFile = "lib/store.tsx"
const settingsFile = "components/panels/settings-panel.tsx"
const menuFile = "components/route-editor-menu.tsx"
const mapFile = "components/yandex-map.tsx"

let store = fs.readFileSync(storeFile, "utf8").replace(/\r\n/g, "\n")
let settings = fs.readFileSync(settingsFile, "utf8").replace(/\r\n/g, "\n")
let map = fs.readFileSync(mapFile, "utf8").replace(/\r\n/g, "\n")

// ---------- lib/store.tsx ----------

if (!store.includes("const PERSISTED_ROUTES_KEY")) {
  if (store.includes(`const PERSISTED_BEACON_POSITION_KEY = "map-tracker:beacon-position:v1"`)) {
    store = replaceOnce(
      store,
      `const PERSISTED_BEACON_POSITION_KEY = "map-tracker:beacon-position:v1"`,
      `const PERSISTED_BEACON_POSITION_KEY = "map-tracker:beacon-position:v1"
const PERSISTED_ROUTES_KEY = "map-tracker:saved-routes:v1"`,
      "routes storage key after beacon key"
    )
  } else {
    store = replaceOnce(
      store,
      `const PERSISTED_STORE_KEY = "map-tracker:settings:v1"`,
      `const PERSISTED_STORE_KEY = "map-tracker:settings:v1"
const PERSISTED_ROUTES_KEY = "map-tracker:saved-routes:v1"`,
      "routes storage key after store key"
    )
  }
}

const routeTypes = `type SavedRoute = {
  id: string
  name: string
  points: LatLng[]
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
}`

if (store.includes("type RouteEditorSaveOptions")) {
  store = store.replace(/type SavedRoute = \{[\s\S]*?\n\}\n\n/g, "")
  store = store.replace(/type RouteEditorSaveOptions = \{[\s\S]*?\n\}/, routeTypes)
} else {
  store = replaceOnce(
    store,
    `type RouteCursor = {
  segmentIndex: number
  offsetMeters: number
}`,
    `type RouteCursor = {
  segmentIndex: number
  offsetMeters: number
}

${routeTypes}`,
    "saved route types"
  )
}

if (!store.includes("const DEFAULT_SAVED_ROUTES")) {
  store = replaceOnce(
    store,
    `function parseRoutePoints(text: string): LatLng[] {`,
    `const DEFAULT_SAVED_ROUTES: SavedRoute[] = [
  {
    id: "default-kz-spb",
    name: "Казахстан → Санкт-Петербург",
    points: KZ_SPB_ROUTE_POINTS,
    stepMeters: DEFAULT_SETTINGS.stepMeters,
    intervalMs: DEFAULT_SETTINGS.intervalMs,
    routeLoop: DEFAULT_SETTINGS.routeLoop,
    createdAt: 0,
    updatedAt: 0,
  },
]

function formatRoutePoints(points: LatLng[]) {
  return points.map((point) => \`\${point[0].toFixed(6)}, \${point[1].toFixed(6)}\`).join("\\n")
}

function normalizeSavedRoute(value: unknown): SavedRoute | null {
  if (!value || typeof value !== "object") return null

  const route = value as Partial<SavedRoute>
  const points = Array.isArray(route.points)
    ? route.points.filter((point): point is LatLng => (
        Array.isArray(point) &&
        point.length === 2 &&
        typeof point[0] === "number" &&
        typeof point[1] === "number" &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]) &&
        Math.abs(point[0]) <= 90 &&
        Math.abs(point[1]) <= 180
      ))
    : []

  if (!route.id || typeof route.id !== "string") return null
  if (points.length < 2) return null

  const now = Date.now()

  return {
    id: route.id,
    name: typeof route.name === "string" && route.name.trim() ? route.name.trim() : "Маршрут",
    points,
    stepMeters: Math.max(1, Math.min(30_000, Math.round(route.stepMeters ?? DEFAULT_SETTINGS.stepMeters))),
    intervalMs: Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.round(route.intervalMs ?? DEFAULT_SETTINGS.intervalMs))),
    routeLoop: Boolean(route.routeLoop),
    createdAt: typeof route.createdAt === "number" ? route.createdAt : now,
    updatedAt: typeof route.updatedAt === "number" ? route.updatedAt : now,
  }
}

function readPersistedSavedRoutes(): SavedRoute[] {
  if (typeof window === "undefined") return DEFAULT_SAVED_ROUTES

  try {
    const raw = window.localStorage.getItem(PERSISTED_ROUTES_KEY)
    if (!raw) return DEFAULT_SAVED_ROUTES

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_SAVED_ROUTES

    const routes = parsed.map(normalizeSavedRoute).filter((route): route is SavedRoute => route != null)
    return routes.length > 0 ? routes : DEFAULT_SAVED_ROUTES
  } catch {
    return DEFAULT_SAVED_ROUTES
  }
}

function writePersistedSavedRoutes(routes: SavedRoute[]) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(PERSISTED_ROUTES_KEY, JSON.stringify(routes))
  } catch {}
}

function parseRoutePoints(text: string): LatLng[] {`,
    "saved route helpers before parseRoutePoints"
  )
}

if (!store.includes("savedRoutes: SavedRoute[]")) {
  store = replaceOnce(
    store,
    `  routeEditorActive: boolean
  routeEditorPoints: LatLng[]`,
    `  routeEditorActive: boolean
  routeEditorPoints: LatLng[]
  savedRoutes: SavedRoute[]
  activeRouteId: string | null`,
    "StoreValue saved route fields"
  )
}

store = store.replace(
  `  startRouteEditor: () => void`,
  `  startRouteEditor: (points?: LatLng[], routeId?: string | null) => void`
)

store = store.replace(
  `  startRouteEditor: (points?: LatLng[]) => void`,
  `  startRouteEditor: (points?: LatLng[], routeId?: string | null) => void`
)

store = store.replace(
  `  saveRouteEditor: () => void`,
  `  saveRouteEditor: (options?: RouteEditorSaveOptions) => void`
)

if (!store.includes("applySavedRoute:")) {
  store = replaceOnce(
    store,
    `  clearRouteEditorPoints: () => void
  updateRoutePointsText: (text: string) => void`,
    `  clearRouteEditorPoints: () => void
  applySavedRoute: (routeId: string, autoMove?: boolean) => void
  deleteSavedRoute: (routeId: string) => void
  updateRoutePointsText: (text: string) => void`,
    "StoreValue saved route actions"
  )
}

if (!store.includes("const [savedRoutes")) {
  store = replaceOnce(
    store,
    `  const [routeEditorActive, setRouteEditorActive] = useState(false)
  const [routeEditorPoints, setRouteEditorPoints] = useState<LatLng[]>([])
  const [storageReady, setStorageReady] = useState(false)`,
    `  const [routeEditorActive, setRouteEditorActive] = useState(false)
  const [routeEditorPoints, setRouteEditorPoints] = useState<LatLng[]>([])
  const [routeEditorEditingId, setRouteEditorEditingId] = useState<string | null>(null)
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(DEFAULT_SAVED_ROUTES)
  const [activeRouteId, setActiveRouteId] = useState<string | null>(DEFAULT_SAVED_ROUTES[0]?.id ?? null)
  const [storageReady, setStorageReady] = useState(false)`,
    "saved route state"
  )
}

if (!store.includes("const savedRoutesRef")) {
  store = replaceOnce(
    store,
    `  const routePointsRef = useRef(routePoints)`,
    `  const routePointsRef = useRef(routePoints)
  const savedRoutesRef = useRef(savedRoutes)`,
    "saved routes ref"
  )
}

if (!store.includes("savedRoutesRef.current = savedRoutes")) {
  store = replaceOnce(
    store,
    `  routePointsRef.current = routePoints`,
    `  routePointsRef.current = routePoints
  savedRoutesRef.current = savedRoutes`,
    "saved routes ref sync"
  )
}

if (!store.includes("readPersistedSavedRoutes()")) {
  store = replaceOnce(
    store,
    `  useEffect(() => {
    const root = document.documentElement`,
    `  useEffect(() => {
    const routes = readPersistedSavedRoutes()
    setSavedRoutes(routes)
    savedRoutesRef.current = routes
    setActiveRouteId((prev) => prev ?? routes[0]?.id ?? null)
  }, [])

  useEffect(() => {
    writePersistedSavedRoutes(savedRoutes)
  }, [savedRoutes])

  useEffect(() => {
    const root = document.documentElement`,
    "saved routes persistence effects"
  )
}

const enhancedRouteEditorCallbacks = `  const startRouteEditor = useCallback((points?: LatLng[], routeId?: string | null) => {
    const initialPoints = Array.isArray(points) ? points.filter(Boolean) : []

    setSettings((prev) => ({
      ...prev,
      autoMove: false,
      scenarioEnabled: false,
    }))
    setMoving(false)
    setRouteError(null)
    setRouteStatus("idle")
    setRouteEditorPoints(initialPoints)
    setRouteEditorEditingId(routeId ?? null)
    setRouteEditorActive(true)

    const last = initialPoints[initialPoints.length - 1]
    if (last) {
      setPosition(last)
      positionRef.current = last
      currentNodeRef.current = nearestNode(last)
      streetTargetNodeRef.current = null
      routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
      setSpeedKmh(0)
      setStreet("Редактор маршрута")
      setCenterRequest({ position: last, nonce: Date.now() })
    }
  }, [])

  const cancelRouteEditor = useCallback(() => {
    setRouteEditorActive(false)
    setRouteEditorPoints([])
    setRouteEditorEditingId(null)
    setRouteError(null)
    setRouteStatus(settingsRef.current.routeMode ? routeStatus : "idle")
  }, [routeStatus])

  const addRouteEditorPoint = useCallback((point: LatLng) => {
    setRouteEditorPoints((prev) => [...prev, point])

    setPosition(point)
    positionRef.current = point
    currentNodeRef.current = nearestNode(point)
    streetTargetNodeRef.current = null
    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    setSpeedKmh(0)
    setStreet("Редактор маршрута")
  }, [])

  const undoRouteEditorPoint = useCallback(() => {
    setRouteEditorPoints((prev) => {
      const next = prev.slice(0, -1)
      const last = next[next.length - 1]

      if (last) {
        setPosition(last)
        positionRef.current = last
        currentNodeRef.current = nearestNode(last)
        streetTargetNodeRef.current = null
        routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
        setSpeedKmh(0)
        setStreet("Редактор маршрута")
      }

      return next
    })
  }, [])

  const clearRouteEditorPoints = useCallback(() => {
    setRouteEditorPoints([])
    setRouteError(null)
    setRouteStatus("idle")
  }, [])

  const applySavedRoute = useCallback((routeId: string, autoMove = true) => {
    const route = savedRoutesRef.current.find((item) => item.id === routeId)
    if (!route || route.points.length < 2) return

    const points = route.points
    const start = points[0]

    setActiveRouteId(route.id)
    setRoutePointsText(formatRoutePoints(points))
    setRoutePoints(points)
    routePointsRef.current = points

    setRoutePath([])
    routePathRef.current = []
    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    streetTargetNodeRef.current = null

    setPosition(start)
    positionRef.current = start
    currentNodeRef.current = nearestNode(start)
    setSpeedKmh(0)
    setStreet(ROUTE_STREET_LABEL)
    setCenterRequest({ position: start, nonce: Date.now() })

    if (typeof writePersistedBeaconPosition === "function") {
      writePersistedBeaconPosition(start)
    }

    setRouteStatus("building")
    setRouteError(null)

    setSettings((prev) => ({
      ...prev,
      routeMode: true,
      followRoute: true,
      autoMove,
      routeLoop: route.routeLoop,
      scenarioEnabled: false,
      stepMeters: route.stepMeters,
      intervalMs: route.intervalMs,
    }))
    setMoving(autoMove)

    pushHistory({
      position: start,
      speedKmh: 0,
      street: ROUTE_STREET_LABEL,
      event: "route",
      note: \`Выбран маршрут «\${route.name}»\`,
    })

    evaluateGeofences(start)
  }, [evaluateGeofences, pushHistory])

  const deleteSavedRoute = useCallback((routeId: string) => {
    setSavedRoutes((prev) => {
      const next = prev.filter((route) => route.id !== routeId)
      const safeNext = next.length > 0 ? next : DEFAULT_SAVED_ROUTES
      writePersistedSavedRoutes(safeNext)
      savedRoutesRef.current = safeNext
      return safeNext
    })

    setActiveRouteId((prev) => prev === routeId ? null : prev)
    setRouteEditorEditingId((prev) => prev === routeId ? null : prev)
  }, [])

  const saveRouteEditor = useCallback((options?: RouteEditorSaveOptions) => {
    const points = routeEditorPoints

    if (points.length < 2) {
      setRouteStatus("error")
      setRouteError("Для маршрута нужно минимум две точки")
      return
    }

    const now = Date.now()
    const existing = routeEditorEditingId
      ? savedRoutesRef.current.find((route) => route.id === routeEditorEditingId)
      : null

    const safeStepMeters = Math.max(1, Math.min(30_000, Math.round(options?.stepMeters ?? existing?.stepMeters ?? settingsRef.current.stepMeters ?? 5)))
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
    }

    setSavedRoutes((prev) => {
      const exists = prev.some((route) => route.id === routeId)
      const next = exists
        ? prev.map((route) => route.id === routeId ? savedRoute : route)
        : [savedRoute, ...prev]

      writePersistedSavedRoutes(next)
      savedRoutesRef.current = next
      return next
    })

    setActiveRouteId(routeId)
    setRouteEditorActive(false)
    setRouteEditorPoints([])
    setRouteEditorEditingId(null)

    setRoutePointsText(formatRoutePoints(points))
    setRoutePoints(points)
    routePointsRef.current = points

    setRoutePath([])
    routePathRef.current = []
    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    streetTargetNodeRef.current = null

    setPosition(start)
    positionRef.current = start
    currentNodeRef.current = nearestNode(start)
    setSpeedKmh(0)
    setStreet(ROUTE_STREET_LABEL)
    setCenterRequest({ position: start, nonce: Date.now() })

    if (typeof writePersistedBeaconPosition === "function") {
      writePersistedBeaconPosition(start)
    }

    setRouteStatus("building")
    setRouteError(null)

    setSettings((prev) => ({
      ...prev,
      routeMode: true,
      followRoute: true,
      autoMove: options?.autoMove ?? false,
      routeLoop,
      scenarioEnabled: false,
      stepMeters: safeStepMeters,
      intervalMs: safeIntervalMs,
    }))
    setMoving(false)

    pushHistory({
      position: start,
      speedKmh: 0,
      street: ROUTE_STREET_LABEL,
      event: "route",
      note: \`Сохранён маршрут «\${routeName}»: \${points.length} точ., шаг \${safeStepMeters} м, интервал \${safeIntervalMs} мс\`,
    })

    evaluateGeofences(start)
  }, [evaluateGeofences, pushHistory, routeEditorEditingId, routeEditorPoints])

  const resetPosition = useCallback`

if (store.includes("  const startRouteEditor = useCallback")) {
  store = store.replace(
    /  const startRouteEditor = useCallback\([\s\S]*?\n  const resetPosition = useCallback/,
    enhancedRouteEditorCallbacks
  )
} else {
  throw new Error("Cannot find route editor callbacks in store")
}

if (!store.includes("    savedRoutes,")) {
  store = replaceOnce(
    store,
    `    routeEditorActive,
    routeEditorPoints,`,
    `    routeEditorActive,
    routeEditorPoints,
    savedRoutes,
    activeRouteId,`,
    "store value saved routes"
  )
}

if (!store.includes("    applySavedRoute,")) {
  store = replaceOnce(
    store,
    `    clearRouteEditorPoints,
    updateRoutePointsText,`,
    `    clearRouteEditorPoints,
    applySavedRoute,
    deleteSavedRoute,
    updateRoutePointsText,`,
    "store value saved route actions"
  )
}

store = store.replace(
  `routeEditorActive, routeEditorPoints, startRouteEditor, cancelRouteEditor, saveRouteEditor, addRouteEditorPoint, undoRouteEditorPoint, clearRouteEditorPoints, updateRoutePointsText`,
  `routeEditorActive, routeEditorPoints, savedRoutes, activeRouteId, startRouteEditor, cancelRouteEditor, saveRouteEditor, addRouteEditorPoint, undoRouteEditorPoint, clearRouteEditorPoints, applySavedRoute, deleteSavedRoute, updateRoutePointsText`
)

// ---------- components/route-editor-menu.tsx ----------

const routeEditorMenu = `"use client"

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
`

fs.writeFileSync(menuFile, routeEditorMenu, "utf8")

// ---------- components/panels/settings-panel.tsx ----------

if (!settings.includes("savedRoutes,")) {
  settings = settings.replace(
    `    routePointsText,`,
    `    routePointsText,
    savedRoutes,
    activeRouteId,`
  )
}

if (!settings.includes("applySavedRoute,")) {
  settings = settings.replace(
    `    startRouteEditor,
    setActivePanel,`,
    `    startRouteEditor,
    applySavedRoute,
    deleteSavedRoute,
    setActivePanel,`
  )
}

if (!settings.includes("    routePoints,\n")) {
  settings = settings.replace(
    `    routePointsText,
    savedRoutes,`,
    `    routePointsText,
    routePoints,
    savedRoutes,`
  )
}

const routeSection = `          <Section title="Маршруты">
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Создавайте несколько маршрутов, выбирайте нужный для движения точки или открывайте его на редактирование прямо на карте.
              </p>

              <button
                type="button"
                onClick={() => {
                  startRouteEditor([])
                  setActivePanel("map")
                }}
                className="w-full rounded-lg px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: "var(--grad-primary)", boxShadow: "var(--glow-primary)" }}
              >
                Создать новый маршрут на карте
              </button>

              <div className="space-y-2">
                {savedRoutes.map((route) => (
                  <div
                    key={route.id}
                    className="rounded-xl border border-border bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {route.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {route.points.length} точ. · шаг {route.stepMeters} м · {route.intervalMs} мс
                          {activeRouteId === route.id ? " · выбран" : ""}
                        </p>
                      </div>

                      <span className="shrink-0 rounded-full bg-card px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {route.routeLoop ? "loop" : "one-way"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          applySavedRoute(route.id, true)
                          setActivePanel("map")
                        }}
                        className="rounded-lg px-2 py-2 text-xs font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
                        style={{ background: "var(--grad-primary)" }}
                      >
                        Идти
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          startRouteEditor(route.points, route.id)
                          setActivePanel("map")
                        }}
                        className="rounded-lg border border-border bg-card px-2 py-2 text-xs font-semibold transition-colors hover:bg-accent"
                      >
                        Править
                      </button>

                      <button
                        type="button"
                        disabled={savedRoutes.length <= 1}
                        onClick={() => deleteSavedRoute(route.id)}
                        className="rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/15 disabled:opacity-40"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <DisplayModeSettings />`

settings = settings.replace(
  /\s*<Section title="Редактор маршрута">[\s\S]*?<\/Section>\s*<DisplayModeSettings \/>/,
  "\n" + routeSection
)

if (!settings.includes(`<Section title="Маршруты">`)) {
  settings = replaceOnce(
    settings,
    `          <DisplayModeSettings />`,
    routeSection,
    "insert saved routes section"
  )
}

fs.writeFileSync(settingsFile, settings, "utf8")

// ---------- components/yandex-map.tsx ----------
// На всякий случай фиксируем добавление точек: ПКМ точно добавляет точку маршрута.
if (!map.includes("handleEditorMapPoint")) {
  const oldClickBlock = `        map.events.add("click", (e: any) => {
          if (cancelled) return
          const coords: [number, number] = e.get("coords")
          placeBeaconRef.current([coords[0], coords[1]])
        })`

  const newClickBlock = `        const addEditorPointSafely = (point: LatLng) => {
          addRouteEditorPointRef.current(point)
        }

        const readMapEventPoint = (e: any): LatLng | null => {
          try {
            const coords: [number, number] | undefined = e.get("coords")
            if (!coords || typeof coords[0] !== "number" || typeof coords[1] !== "number") return null
            return [coords[0], coords[1]]
          } catch {
            return null
          }
        }

        const handleEditorMapPoint = (e: any) => {
          if (cancelled || !routeEditorActiveRef.current) return
          try { e.preventDefault?.() } catch {}
          try { e.stopPropagation?.() } catch {}

          const point = readMapEventPoint(e)
          if (!point) return
          addEditorPointSafely(point)
        }

        map.events.add("click", (e: any) => {
          if (cancelled) return

          const point = readMapEventPoint(e)
          if (!point) return

          if (routeEditorActiveRef.current) {
            addEditorPointSafely(point)
            return
          }

          placeBeaconRef.current(point)
        })

        map.events.add("contextmenu", handleEditorMapPoint)
        map.events.add("rightclick", handleEditorMapPoint)`

  if (map.includes(oldClickBlock)) {
    map = map.replace(oldClickBlock, newClickBlock)
    fs.writeFileSync(mapFile, map, "utf8")
  }
}

fs.writeFileSync(storeFile, store, "utf8")

console.log("Saved routes list added")
