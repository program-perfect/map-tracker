import fs from "node:fs"

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Cannot find block: ${label}`)
  }
  return content.replace(search, replacement)
}

function ensureFile(path, content) {
  fs.writeFileSync(path, content.replace(/\r\n/g, "\n"), "utf8")
}

const storeFile = "lib/store.tsx"
const mapFile = "components/yandex-map.tsx"
const appShellFile = "components/app-shell.tsx"
const cssFile = "app/globals.css"
const menuFile = "components/route-editor-menu.tsx"

let store = fs.readFileSync(storeFile, "utf8").replace(/\r\n/g, "\n")
let yandexMap = fs.readFileSync(mapFile, "utf8").replace(/\r\n/g, "\n")
let appShell = fs.readFileSync(appShellFile, "utf8").replace(/\r\n/g, "\n")
let css = fs.readFileSync(cssFile, "utf8").replace(/\r\n/g, "\n")

// ---------- lib/store.tsx ----------

if (!store.includes("routeEditorActive: boolean")) {
  store = replaceOnce(
    store,
    `  routeError: string | null
  updateRoutePointsText: (text: string) => void`,
    `  routeError: string | null
  routeEditorActive: boolean
  routeEditorPoints: LatLng[]
  startRouteEditor: () => void
  cancelRouteEditor: () => void
  saveRouteEditor: () => void
  addRouteEditorPoint: (point: LatLng) => void
  undoRouteEditorPoint: () => void
  clearRouteEditorPoints: () => void
  updateRoutePointsText: (text: string) => void`,
    "StoreValue route editor fields"
  )
}

if (!store.includes("const [routeEditorActive")) {
  store = replaceOnce(
    store,
    `  const [routeError, setRouteError] = useState<string | null>(null)
  const [storageReady, setStorageReady] = useState(false)`,
    `  const [routeError, setRouteError] = useState<string | null>(null)
  const [routeEditorActive, setRouteEditorActive] = useState(false)
  const [routeEditorPoints, setRouteEditorPoints] = useState<LatLng[]>([])
  const [storageReady, setStorageReady] = useState(false)`,
    "route editor state"
  )
}

if (!store.includes("const startRouteEditor = useCallback")) {
  const routeEditorCallbacks = `  const startRouteEditor = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      autoMove: false,
      scenarioEnabled: false,
    }))
    setMoving(false)
    setRouteError(null)
    setRouteStatus("idle")
    setRouteEditorPoints([])
    setRouteEditorActive(true)
  }, [])

  const cancelRouteEditor = useCallback(() => {
    setRouteEditorActive(false)
    setRouteEditorPoints([])
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

  const saveRouteEditor = useCallback(() => {
    const points = routeEditorPoints

    if (points.length < 2) {
      setRouteStatus("error")
      setRouteError("Для маршрута нужно минимум две точки")
      return
    }

    const text = points.map((point) => \`\${point[0].toFixed(6)}, \${point[1].toFixed(6)}\`).join("\\n")
    const start = points[0]

    setRouteEditorActive(false)
    setRouteEditorPoints([])

    setRoutePointsText(text)
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

    setRouteStatus("building")
    setRouteError(null)

    setSettings((prev) => ({
      ...prev,
      routeMode: true,
      followRoute: true,
      autoMove: false,
      scenarioEnabled: false,
    }))
    setMoving(false)

    pushHistory({
      position: start,
      speedKmh: 0,
      street: ROUTE_STREET_LABEL,
      event: "route",
      note: "Маршрут создан на карте",
    })

    evaluateGeofences(start)
  }, [evaluateGeofences, pushHistory, routeEditorPoints])

`

  store = replaceOnce(
    store,
    `  const resetPosition = useCallback(() => {`,
    routeEditorCallbacks + `  const resetPosition = useCallback(() => {`,
    "route editor callbacks"
  )
}

if (!store.includes("    routeEditorActive,")) {
  store = replaceOnce(
    store,
    `    routeError,
    updateRoutePointsText,`,
    `    routeError,
    routeEditorActive,
    routeEditorPoints,
    startRouteEditor,
    cancelRouteEditor,
    saveRouteEditor,
    addRouteEditorPoint,
    undoRouteEditorPoint,
    clearRouteEditorPoints,
    updateRoutePointsText,`,
    "store value route editor fields"
  )
}

if (!store.includes("routeEditorActive, routeEditorPoints")) {
  store = store.replace(
    `routeStatus, routeError, updateRoutePointsText`,
    `routeStatus, routeError, routeEditorActive, routeEditorPoints, startRouteEditor, cancelRouteEditor, saveRouteEditor, addRouteEditorPoint, undoRouteEditorPoint, clearRouteEditorPoints, updateRoutePointsText`
  )
}

// ---------- components/yandex-map.tsx ----------

if (!yandexMap.includes("routeEditorActive")) {
  yandexMap = replaceOnce(
    yandexMap,
    `    setRouteBuildState,
  } = useStore()`,
    `    setRouteBuildState,
    routeEditorActive,
    routeEditorPoints,
    addRouteEditorPoint,
  } = useStore()`,
    "YandexMap route editor store fields"
  )
}

if (!yandexMap.includes("routeEditorObjectsRef")) {
  yandexMap = replaceOnce(
    yandexMap,
    `  const destinationRef = useRef<any>(null)`,
    `  const destinationRef = useRef<any>(null)
  const routeEditorObjectsRef = useRef<any[]>([])`,
    "route editor map objects ref"
  )
}

if (!yandexMap.includes("routeEditorActiveRef")) {
  yandexMap = replaceOnce(
    yandexMap,
    `  const setRouteBuildStateRef = useRef(setRouteBuildState)
  setRouteBuildStateRef.current = setRouteBuildState`,
    `  const setRouteBuildStateRef = useRef(setRouteBuildState)
  setRouteBuildStateRef.current = setRouteBuildState
  const routeEditorActiveRef = useRef(routeEditorActive)
  routeEditorActiveRef.current = routeEditorActive
  const addRouteEditorPointRef = useRef(addRouteEditorPoint)
  addRouteEditorPointRef.current = addRouteEditorPoint`,
    "route editor refs"
  )
}

if (!yandexMap.includes("addRouteEditorPointRef.current")) {
  yandexMap = replaceOnce(
    yandexMap,
    `        map.events.add("click", (e: any) => {
          if (cancelled) return
          const coords: [number, number] = e.get("coords")
          placeBeaconRef.current([coords[0], coords[1]])
        })`,
    `        map.events.add("click", (e: any) => {
          if (cancelled) return
          const coords: [number, number] = e.get("coords")
          const point: LatLng = [coords[0], coords[1]]

          if (routeEditorActiveRef.current) {
            addRouteEditorPointRef.current(point)
            return
          }

          placeBeaconRef.current(point)
        })`,
    "map click route editor handling"
  )
}

if (!yandexMap.includes("routeEditorObjectsRef")) {
  throw new Error("routeEditorObjectsRef was not added correctly")
}

if (!yandexMap.includes("Редактор маршрута")) {
  const editorEffect = `

  useEffect(() => {
    const map = mapRef.current
    const ymaps = window.ymaps
    if (!map || !ymaps || status !== "ready") return

    const clearEditorObjects = () => {
      for (const object of routeEditorObjectsRef.current) {
        try {
          map.geoObjects.remove(object)
        } catch {}
      }
      routeEditorObjectsRef.current = []
    }

    clearEditorObjects()

    if (!routeEditorActive) return clearEditorObjects

    const objects: any[] = []

    if (routeEditorPoints.length >= 2) {
      const line = new ymaps.Polyline(
        routeEditorPoints,
        { hintContent: "Редактор маршрута" },
        {
          strokeColor: "#a855f7",
          strokeOpacity: 0.9,
          strokeWidth: 4,
          strokeStyle: "shortdash",
        }
      )
      objects.push(line)
      map.geoObjects.add(line)
    }

    routeEditorPoints.forEach((point, index) => {
      const placemark = new ymaps.Placemark(
        point,
        {
          iconContent: String(index + 1),
          hintContent: index === 0 ? "Старт маршрута" : \`Точка маршрута \${index + 1}\`,
        },
        {
          preset: index === 0 ? "islands#violetStretchyIcon" : "islands#blueStretchyIcon",
        }
      )

      objects.push(placemark)
      map.geoObjects.add(placemark)
    })

    routeEditorObjectsRef.current = objects

    return clearEditorObjects
  }, [routeEditorActive, routeEditorPoints, status])
`

  yandexMap = replaceOnce(
    yandexMap,
    `  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (Math.round(map.getZoom()) !== zoom) map.setZoom(zoom, { duration: 200 })
  }, [zoom])`,
    `  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (Math.round(map.getZoom()) !== zoom) map.setZoom(zoom, { duration: 200 })
  }, [zoom])${editorEffect}`,
    "route editor overlay effect"
  )
}

yandexMap = yandexMap.replace(
  `className="absolute inset-0 overflow-hidden"`,
  `className={cn("absolute inset-0 overflow-hidden", routeEditorActive && "cursor-crosshair")}`
)

// ---------- components/route-editor-menu.tsx ----------

ensureFile(menuFile, `"use client"

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

  if (!routeEditorActive) {
    return (
      <div className="pointer-events-auto">
        <button
          type="button"
          onClick={startRouteEditor}
          className="rounded-2xl px-4 py-3 text-sm font-semibold text-primary-foreground shadow-2xl transition-all hover:brightness-110 active:scale-95"
          style={{ background: "var(--grad-primary)", boxShadow: "var(--glow-primary)" }}
        >
          Задать маршрут на карте
        </button>
      </div>
    )
  }

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
`)

// ---------- components/app-shell.tsx ----------

if (!appShell.includes(`import { RouteEditorMenu }`)) {
  appShell = replaceOnce(
    appShell,
    `import { YandexMap } from "@/components/yandex-map"`,
    `import { YandexMap } from "@/components/yandex-map"
import { RouteEditorMenu } from "@/components/route-editor-menu"`,
    "RouteEditorMenu import"
  )
}

if (!appShell.includes("routeEditorActive")) {
  appShell = replaceOnce(
    appShell,
    `  const { activePanel, settings } = useStore()`,
    `  const { activePanel, settings, routeEditorActive } = useStore()`,
    "routeEditorActive in AppShell"
  )
}

appShell = appShell.replace(
  `<div className="relative h-dvh w-full overflow-hidden bg-card/95 text-foreground dark:bg-card/95">`,
  `<div className={cn("relative h-dvh w-full overflow-hidden bg-card/95 text-foreground dark:bg-card/95", routeEditorActive && "route-editor-frame")}>`
)

if (!appShell.includes("<RouteEditorMenu />")) {
  appShell = replaceOnce(
    appShell,
    `      </div>
    </div>
  )`,
    `      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-3 lg:bottom-6">
        <RouteEditorMenu />
      </div>
    </div>
  )`,
    "RouteEditorMenu render"
  )
}

// ---------- app/globals.css ----------

if (!css.includes("/* Route editor frame */")) {
  css += `

/* Route editor frame */
.route-editor-frame::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 60;
  pointer-events: none;
  padding: 2px;
  background: var(--grad-primary);
  opacity: 0.95;
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
}

.route-editor-frame {
  box-shadow:
    inset 0 0 0 1px color-mix(in oklch, var(--primary) 65%, transparent),
    inset 0 0 32px -24px var(--primary);
}
`
}

fs.writeFileSync(storeFile, store, "utf8")
fs.writeFileSync(mapFile, yandexMap, "utf8")
fs.writeFileSync(appShellFile, appShell, "utf8")
fs.writeFileSync(cssFile, css, "utf8")

console.log("Route editor mode added")

