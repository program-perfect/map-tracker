"use client"

import {
  DEFAULT_ROUTE_POINTS_TEXT,
  KZ_SPB_ROUTE_POINTS,
  SPB_ROUTE,
  bearingFromDirection,
  bearing as calcBearing,
  distanceMeters,
  interpolateLatLng,
  moveByDistance,
  nearestNode,
  pickNextNode,
} from "@/lib/geo"
import { playAlarm } from "@/lib/sound"
import type {
  BeaconSettings,
  Geofence,
  HistoryEntry,
  LatLng,
  MapLayer,
  PanelId,
  RotationMode,
  RouteBuildStatus,
  Scenario,
  ScenarioStep,
  ThemeMode,
  TrackedObject,
} from "@/lib/types"
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

const SPB_STREETS = [
  "Невский проспект",
  "Дворцовая набережная",
  "Литейный проспект",
  "Садовая улица",
  "Лиговский проспект",
  "набережная реки Фонтанки",
  "Большая Морская улица",
  "площадь Восстания",
  "Малая Конюшенная улица",
  "Гороховая улица",
]

function streetForIndex(i: number): string {
  return SPB_STREETS[i % SPB_STREETS.length]
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

const MIN_INTERVAL_MS = 1
const DEFAULT_INTERVAL_MS = 5_000
const MAX_INTERVAL_MS = 5 * 60_000
const LIGHT_DEFAULT_BEACON_COLOR = "#ef4444"
const MIN_MARKER_SIZE = 30
const DEFAULT_MARKER_SIZE = 30
const MAX_MARKER_SIZE = 64

const UI_THEME_PRESETS: Record<string, { primary: string; secondary: string; accent: string; primaryForeground: string }> = {
  violet: {
    primary: "#7c3aed",
    secondary: "#a855f7",
    accent: "color-mix(in oklch, #7c3aed 14%, var(--background))",
    primaryForeground: "#ffffff",
  },
  cobalt: {
    primary: "#2563eb",
    secondary: "#06b6d4",
    accent: "color-mix(in oklch, #2563eb 14%, var(--background))",
    primaryForeground: "#ffffff",
  },
  emerald: {
    primary: "#059669",
    secondary: "#22c55e",
    accent: "color-mix(in oklch, #059669 14%, var(--background))",
    primaryForeground: "#ffffff",
  },
  amber: {
    primary: "#d97706",
    secondary: "#f59e0b",
    accent: "color-mix(in oklch, #d97706 16%, var(--background))",
    primaryForeground: "#111827",
  },
  rose: {
    primary: "#e11d48",
    secondary: "#f97316",
    accent: "color-mix(in oklch, #e11d48 14%, var(--background))",
    primaryForeground: "#ffffff",
  },
  cyan: {
    primary: "#0891b2",
    secondary: "#14b8a6",
    accent: "color-mix(in oklch, #0891b2 14%, var(--background))",
    primaryForeground: "#ffffff",
  },
  graphite: {
    primary: "#475569",
    secondary: "#111827",
    accent: "color-mix(in oklch, #475569 16%, var(--background))",
    primaryForeground: "#ffffff",
  },
  neon: {
    primary: "#8b5cf6",
    secondary: "#ec4899",
    accent: "color-mix(in oklch, #8b5cf6 18%, var(--background))",
    primaryForeground: "#ffffff",
  },
}
const ROUTE_STREET_LABEL = "Маршрут Казахстан → Санкт-Петербург"
const PERSISTED_BEACON_POSITION_KEY = "map-tracker:beacon-position:v1"
const PERSISTED_ROUTES_KEY = "map-tracker:saved-routes:v1"
const ROAD_SNAP_MAX_METERS = 2500
const USER_LOCATION_STREET_LABEL = "Текущее местоположение"
const INITIAL_GEOLOCATION_DONE_KEY = "map-tracker:initial-geolocation-done"

type RouteCursor = {
  segmentIndex: number
  offsetMeters: number
}

type SavedRoute = {
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
}

const DEFAULT_SETTINGS: BeaconSettings = {
  visible: true,
  autoMove: true,
  intervalMs: DEFAULT_INTERVAL_MS,
  stepMeters: 5,
  direction: "NE",
  followRoute: true,
  routeMode: false,
  routeLoop: false,
  scheduledMove: false,
  scheduleAt: "12:00",
  scenarioEnabled: false,
  activeScenarioId: null,
  pulseEnabled: true,
  pulseDurationMs: 1100,
  pulseScale: 5,
  soundEnabled: true,
  soundVolume: 1,
  alarmSound: "warning",
  continuousAlarm: true,
  mapHue: 40,
  mapDarkBrightness: 88,
  mapDarkContrast: 100,
  mapDarkSaturation: 130,
  uiThemePreset: "violet",
  customThemePrimary: "#7c3aed",
  customThemeSecondary: "#a855f7",
  customThemeAccent: "#ede9fe",
  uiScale: 100,
  uiDensity: 100,
  uiRadius: 100,
  uiBlur: 24,
  beaconColor: LIGHT_DEFAULT_BEACON_COLOR,
  markerSize: DEFAULT_MARKER_SIZE,
  panelWidth: 340,
  mobileMapStripVisible: false,
}

function clampSettingNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, Math.round(number)))
}

const DEFAULT_ZOOM = 5

const DEFAULT_LAYERS: Record<MapLayer, boolean> = {
  traffic: false,
  transport: false,
  roads: true,
  labels: true,
  buildings: true,
}

const PERSISTED_STORE_VERSION = 1
const PERSISTED_STORE_KEY = "map-tracker:settings:v1"

type PersistedStoreState = {
  version: typeof PERSISTED_STORE_VERSION
  theme?: ThemeMode
  layers?: Partial<Record<MapLayer, boolean>>
  zoom?: number
  settings?: Partial<BeaconSettings>
  routePointsText?: string
}

function readPersistedStoreState(): PersistedStoreState | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(PERSISTED_STORE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<PersistedStoreState>
    if (parsed.version !== PERSISTED_STORE_VERSION) return null

    return parsed as PersistedStoreState
  } catch {
    return null
  }
}

function writePersistedStoreState(state: PersistedStoreState) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(PERSISTED_STORE_KEY, JSON.stringify(state))
  } catch {
    // localStorage can fail in private mode, old WebViews, or full storage.
  }
}

function clearPersistedStoreState() {
  if (typeof window === "undefined") return

  try {
    window.localStorage.removeItem(PERSISTED_STORE_KEY)
    window.sessionStorage.removeItem(INITIAL_GEOLOCATION_DONE_KEY)
  } catch {}
}

function canUseBrowserGeolocation() {
  return typeof window !== "undefined" && "geolocation" in navigator
}

function wasInitialGeolocationUsed() {
  if (typeof window === "undefined") return true

  try {
    return window.sessionStorage.getItem(INITIAL_GEOLOCATION_DONE_KEY) === "1"
  } catch {
    return false
  }
}

function markInitialGeolocationUsed() {
  if (typeof window === "undefined") return

  try {
    window.sessionStorage.setItem(INITIAL_GEOLOCATION_DONE_KEY, "1")
  } catch {}
}

function isValidBeaconPosition(value: unknown): value is LatLng {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 90 &&
    Math.abs(value[1]) <= 180
  )
}

function readPersistedBeaconPosition(): LatLng | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(PERSISTED_BEACON_POSITION_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    return isValidBeaconPosition(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writePersistedBeaconPosition(position: LatLng) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(PERSISTED_BEACON_POSITION_KEY, JSON.stringify(position))
  } catch {}
}

function clearPersistedBeaconPosition() {
  if (typeof window === "undefined") return

  try {
    window.localStorage.removeItem(PERSISTED_BEACON_POSITION_KEY)
  } catch {}
}

const DEFAULT_SCENARIOS: Scenario[] = [
  {
    id: "sc-kz-spb",
    name: "Казахстан → Санкт-Петербург",
    loop: false,
    steps: [
      { id: uid(), delayMs: 1000, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 1000, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 2500, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 1000, stepMeters: 5, direction: null },
    ],
  },
  {
    id: "sc-patrol",
    name: "Патруль",
    loop: true,
    steps: [
      { id: uid(), delayMs: 1000, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 1000, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 3000, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 1000, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 5000, stepMeters: 5, direction: null },
    ],
  },
  {
    id: "sc-fast",
    name: "Быстрое движение",
    loop: true,
    steps: [
      { id: uid(), delayMs: 500, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 500, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 500, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 500, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 2000, stepMeters: 5, direction: null },
    ],
  },
  {
    id: "sc-stop-go",
    name: "Стой-иди",
    loop: true,
    steps: [
      { id: uid(), delayMs: 2000, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 8000, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 2000, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 8000, stepMeters: 5, direction: null },
    ],
  },
]

const INITIAL_OBJECTS: TrackedObject[] = [
  { id: "beacon-1", name: "Маяк-01", type: "vehicle", online: true, battery: 87, position: KZ_SPB_ROUTE_POINTS[0], street: "Астана, Казахстан" },
  { id: "beacon-2", name: "Курьер-14", type: "person", online: true, battery: 62, position: [59.9311, 30.3609], street: "Лиговский проспект" },
  { id: "beacon-3", name: "Груз-А7", type: "asset", online: false, battery: 18, position: [59.9501, 30.3056], street: "Дворцовая набережная" },
]

const INITIAL_GEOFENCES: Geofence[] = [
  { id: uid(), name: "Центр", center: [59.9386, 30.3141], radius: 1200, active: true, color: "#a855f7", alertOnEnter: true, alertOnExit: true },
  { id: uid(), name: "Площадь Восстания", center: [59.9311, 30.3609], radius: 600, active: false, color: "#f59e0b", alertOnEnter: true, alertOnExit: false },
]

const DEFAULT_SAVED_ROUTES: SavedRoute[] = [
  {
    id: "default-kz-spb",
    name: "Казахстан → Санкт-Петербург",
    points: KZ_SPB_ROUTE_POINTS,
    sourcePoints: KZ_SPB_ROUTE_POINTS,
    interpolationEnabled: false,
    interpolationFactor: 0,
    sourceStepMeters: DEFAULT_SETTINGS.stepMeters,
    sourceIntervalMs: DEFAULT_SETTINGS.intervalMs,
    generatedStepMeters: DEFAULT_SETTINGS.stepMeters,
    generatedIntervalMs: DEFAULT_SETTINGS.intervalMs,
    stepMeters: DEFAULT_SETTINGS.stepMeters,
    intervalMs: DEFAULT_SETTINGS.intervalMs,
    routeLoop: DEFAULT_SETTINGS.routeLoop,
    createdAt: 0,
    updatedAt: 0,
  },
]

function clampRouteNumber(value: unknown, min: number, max: number, fallback: number) {
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

function formatRoutePoints(points: LatLng[]) {
  return points.map((point) => `${point[0].toFixed(6)}, ${point[1].toFixed(6)}`).join("\n")
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

  const sourcePoints = Array.isArray(route.sourcePoints)
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

function parseRoutePoints(text: string): LatLng[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/)
      if (!match) return null
      const lat = Number(match[1])
      const lng = Number(match[2])
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
      return [lat, lng] as LatLng
    })
    .filter((point): point is LatLng => point != null)
}

interface StoreValue {
  theme: ThemeMode
  toggleTheme: () => void
  activePanel: PanelId
  setActivePanel: (p: PanelId) => void
  layers: Record<MapLayer, boolean>
  toggleLayer: (l: MapLayer) => void
  zoom: number
  setZoom: (z: number | ((z: number) => number)) => void
  rotationMode: RotationMode
  toggleRotationMode: () => void
  heading: number
  centerRequest: { position: LatLng; nonce: number } | null
  requestCenter: (position?: LatLng) => void
  settings: BeaconSettings
  updateSettings: (patch: Partial<BeaconSettings>) => void
  resetSettings: () => void
  resetPosition: () => void
  position: LatLng
  speedKmh: number
  street: string
  moving: boolean
  moveOnce: () => void
  placeBeacon: (pos: LatLng) => void
  objects: TrackedObject[]
  history: HistoryEntry[]
  clearHistory: () => void
  geofences: Geofence[]
  addGeofence: () => void
  updateGeofence: (id: string, patch: Partial<Geofence>) => void
  removeGeofence: (id: string) => void
  insideGeofenceIds: string[]
  scenarios: Scenario[]
  addScenario: () => void
  updateScenario: (id: string, patch: Partial<Omit<Scenario, "id" | "steps">>) => void
  removeScenario: (id?: string) => void
  addScenarioStep: (scenarioId: string) => void
  updateScenarioStep: (scenarioId: string, stepId: string, patch: Partial<ScenarioStep>) => void
  removeScenarioStep: (scenarioId: string, stepId: string) => void
  routePointsText: string
  routePoints: LatLng[]
  routePath: LatLng[]
  routeStatus: RouteBuildStatus
  routeError: string | null
  routeEditorActive: boolean
  routeEditorPoints: LatLng[]
  routeEditorEditingId: string | null
  savedRoutes: SavedRoute[]
  activeRouteId: string | null
  startRouteEditor: (points?: LatLng[], routeId?: string | null) => void
  cancelRouteEditor: () => void
  saveRouteEditor: (options?: RouteEditorSaveOptions) => void
  addRouteEditorPoint: (point: LatLng) => void
  undoRouteEditorPoint: () => void
  clearRouteEditorPoints: () => void
  applySavedRoute: (routeId: string, autoMove?: boolean) => void
  renameSavedRoute: (routeId: string, name: string) => void
  deleteSavedRoute: (routeId: string) => void
  updateRoutePointsText: (text: string) => void
  applyRoutePointsText: () => void
  setRoutePathFromMap: (path: LatLng[]) => void
  setRouteBuildState: (status: RouteBuildStatus, error?: string | null) => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function useStore(): StoreValue {
  const ctx = use(StoreContext)
  if (!ctx) throw new Error("useStore must be used within BeaconStoreProvider")
  return ctx
}

export function BeaconStoreProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>("light")
  const [activePanel, setActivePanel] = useState<PanelId>("map")
  const [layers, setLayers] = useState<Record<MapLayer, boolean>>(DEFAULT_LAYERS)
  const [zoom, setZoomState] = useState(DEFAULT_ZOOM)
  const [rotationMode, setRotationMode] = useState<RotationMode>("north")
  const [heading, setHeading] = useState(0)
  const [centerRequest, setCenterRequest] = useState<StoreValue["centerRequest"]>(null)
  const [settings, setSettings] = useState<BeaconSettings>(DEFAULT_SETTINGS)
  const [position, setPosition] = useState<LatLng>(KZ_SPB_ROUTE_POINTS[0])
  const [speedKmh, setSpeedKmh] = useState(0)
  const [street, setStreet] = useState(ROUTE_STREET_LABEL)
  const [moving, setMoving] = useState(false)
  const [objects] = useState<TrackedObject[]>(INITIAL_OBJECTS)
  const [history, setHistory] = useState<HistoryEntry[]>([{ id: uid(), at: Date.now(), position: KZ_SPB_ROUTE_POINTS[0], speedKmh: 0, street: ROUTE_STREET_LABEL, event: "start", note: "Маршрут Казахстан → Санкт-Петербург загружен" }])
  const [geofences, setGeofences] = useState<Geofence[]>(INITIAL_GEOFENCES)
  const [insideGeofenceIds, setInsideGeofenceIds] = useState<string[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>(DEFAULT_SCENARIOS)
  const [routePointsText, setRoutePointsText] = useState(DEFAULT_ROUTE_POINTS_TEXT)
  const [routePoints, setRoutePoints] = useState<LatLng[]>(KZ_SPB_ROUTE_POINTS)
  const [routePath, setRoutePath] = useState<LatLng[]>([])
  const [routeStatus, setRouteStatus] = useState<RouteBuildStatus>("idle")
  const [routeError, setRouteError] = useState<string | null>(null)
  const [routeEditorActive, setRouteEditorActive] = useState(false)
  const [routeEditorPoints, setRouteEditorPoints] = useState<LatLng[]>([])
  const [routeEditorEditingId, setRouteEditorEditingId] = useState<string | null>(null)
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(DEFAULT_SAVED_ROUTES)
  const [activeRouteId, setActiveRouteId] = useState<string | null>(DEFAULT_SAVED_ROUTES[0]?.id ?? null)
  const [storageReady, setStorageReady] = useState(false)

  const stepCountRef = useRef(0)
  const currentNodeRef = useRef(nearestNode(SPB_ROUTE[0]))
  const streetTargetNodeRef = useRef<ReturnType<typeof nearestNode> | null>(null)
  const arrivalBearingRef = useRef(45)
  const routeCursorRef = useRef<RouteCursor>({ segmentIndex: 0, offsetMeters: 0 })
  const settingsRef = useRef(settings)
  const positionRef = useRef(position)
  const persistedPositionLoadedRef = useRef(false)
  const insideRef = useRef<string[]>(insideGeofenceIds)
  const geofencesRef = useRef(geofences)
  const routePathRef = useRef(routePath)
  const routePointsRef = useRef(routePoints)
  const savedRoutesRef = useRef(savedRoutes)
  settingsRef.current = settings
  positionRef.current = position
  insideRef.current = insideGeofenceIds
  geofencesRef.current = geofences
  routePathRef.current = routePath
  routePointsRef.current = routePoints
  savedRoutesRef.current = savedRoutes

  // POSITION_PERSISTENCE_BOOTSTRAP
  useEffect(() => {
    const persisted = readPersistedStoreState()

    if (persisted) {
      if (persisted.theme === "light" || persisted.theme === "dark") {
        setTheme(persisted.theme)
      }

      if (persisted.layers) {
        setLayers({ ...DEFAULT_LAYERS, ...persisted.layers })
      }

      if (typeof persisted.zoom === "number") {
        setZoomState(Math.max(2, Math.min(19, Math.round(persisted.zoom))))
      }

      if (persisted.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...persisted.settings })
      }

      if (typeof persisted.routePointsText === "string") {
        setRoutePointsText(persisted.routePointsText)

        const parsed = parseRoutePoints(persisted.routePointsText)
        if (parsed.length >= 2) {
          setRoutePoints(parsed)
          routePointsRef.current = parsed
          setRoutePath([])
          routePathRef.current = []
          routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
          if (typeof streetTargetNodeRef !== "undefined") streetTargetNodeRef.current = null
        }
      }
    }

    const restoredPosition = readPersistedBeaconPosition()

    if (restoredPosition) {
      persistedPositionLoadedRef.current = true

      setPosition(restoredPosition)
      positionRef.current = restoredPosition
      currentNodeRef.current = nearestNode(restoredPosition)
      if (typeof streetTargetNodeRef !== "undefined") streetTargetNodeRef.current = null
      routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
      setSpeedKmh(0)
      setStreet("Сохранённая позиция")
      setCenterRequest({ position: restoredPosition, nonce: Date.now() })
    }

    setStorageReady(true)
  }, [])

  useEffect(() => {
    if (!storageReady) return

    writePersistedStoreState({
      version: PERSISTED_STORE_VERSION,
      theme,
      layers,
      zoom,
      settings,
      routePointsText,
    })

    writePersistedBeaconPosition(position)
  }, [storageReady, theme, layers, zoom, settings, routePointsText, position])



  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    root.classList.toggle("light", theme === "light")
  }, [theme])

  useEffect(() => {
    const root = document.documentElement

    const themePresetId = settings.uiThemePreset ?? "violet"
    const preset = UI_THEME_PRESETS[themePresetId] ?? UI_THEME_PRESETS.violet
    const primary = themePresetId === "custom" ? settings.customThemePrimary || preset.primary : preset.primary
    const secondary = themePresetId === "custom" ? settings.customThemeSecondary || preset.secondary : preset.secondary
    const accent = themePresetId === "custom" ? settings.customThemeAccent || preset.accent : preset.accent
    const primaryForeground = preset.primaryForeground

    const uiScale = clampSettingNumber(settings.uiScale, 80, 130, 100) / 100
    const uiDensity = clampSettingNumber(settings.uiDensity, 80, 135, 100) / 100
    const uiRadius = clampSettingNumber(settings.uiRadius, 40, 200, 100) / 100
    const uiBlur = clampSettingNumber(settings.uiBlur, 0, 40, 24)

    const mapDarkBrightness = clampSettingNumber(settings.mapDarkBrightness, 55, 130, 88) / 100
    const mapDarkContrast = clampSettingNumber(settings.mapDarkContrast, 70, 150, 100) / 100
    const mapDarkSaturation = clampSettingNumber(settings.mapDarkSaturation, 50, 180, 130) / 100

    root.dataset.uiTheme = themePresetId
    root.style.setProperty("--primary", primary)
    root.style.setProperty("--primary-foreground", primaryForeground)
    root.style.setProperty("--ring", primary)
    root.style.setProperty("--accent", accent)
    root.style.setProperty("--accent-foreground", "var(--foreground)")
    root.style.setProperty("--secondary", `color-mix(in oklch, ${primary} 10%, var(--background))`)
    root.style.setProperty("--secondary-foreground", "var(--foreground)")
    root.style.setProperty("--sidebar-primary", primary)
    root.style.setProperty("--sidebar-primary-foreground", primaryForeground)
    root.style.setProperty("--sidebar-accent", accent)
    root.style.setProperty("--chart-1", primary)
    root.style.setProperty("--chart-4", secondary)
    root.style.setProperty("--grad-primary", `linear-gradient(135deg, ${primary}, ${secondary})`)
    root.style.setProperty("--glow-primary", `0 0 24px -4px color-mix(in oklch, ${primary} 52%, transparent), 0 0 48px -12px color-mix(in oklch, ${secondary} 34%, transparent)`)

    root.style.setProperty("--ui-scale", String(uiScale))
    root.style.setProperty("--ui-density", String(uiDensity))
    root.style.setProperty("--ui-radius-scale", String(uiRadius))
    root.style.setProperty("--radius", `${0.55 * uiRadius}rem`)
    root.style.setProperty("--glass-blur", `${uiBlur}px`)
    root.style.setProperty("--glass-strong-blur", `${Math.max(0, uiBlur + 8)}px`)

    root.style.setProperty("--map-dark-brightness", String(mapDarkBrightness))
    root.style.setProperty("--map-dark-contrast", String(mapDarkContrast))
    root.style.setProperty("--map-dark-saturation", String(mapDarkSaturation))

    root.style.setProperty("--beacon-pulse-duration", `${settings.pulseDurationMs}ms`)
    root.style.setProperty("--beacon-pulse-scale", String(settings.pulseScale))
    root.style.setProperty("--map-hue", `${settings.mapHue}deg`)
    root.style.setProperty("--beacon-user-color", settings.beaconColor)
    root.style.setProperty("--beacon-marker-size", `${settings.markerSize ?? DEFAULT_MARKER_SIZE}px`)
  }, [
    settings.pulseDurationMs,
    settings.pulseScale,
    settings.mapHue,
    settings.mapDarkBrightness,
    settings.mapDarkContrast,
    settings.mapDarkSaturation,
    settings.beaconColor,
    settings.markerSize,
    settings.uiThemePreset,
    settings.customThemePrimary,
    settings.customThemeSecondary,
    settings.customThemeAccent,
    settings.uiScale,
    settings.uiDensity,
    settings.uiRadius,
    settings.uiBlur,
  ])

  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), [])
  const toggleLayer = useCallback((l: MapLayer) => setLayers((prev) => ({ ...prev, [l]: !prev[l] })), [])
  const setZoom = useCallback(
    (z: number | ((z: number) => number)) =>
      setZoomState((prev) =>
        Math.max(2, Math.min(19, Math.round(typeof z === "function" ? z(prev) : z)))
      ),
    []
  )
  const toggleRotationMode = useCallback(() => setRotationMode((m) => (m === "north" ? "movement" : "north")), [])
  const requestCenter = useCallback((p?: LatLng) => setCenterRequest({ position: p ?? positionRef.current, nonce: Date.now() }), [])
  const updateSettings = useCallback((patch: Partial<BeaconSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...patch,
      intervalMs: Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, patch.intervalMs ?? prev.intervalMs ?? DEFAULT_INTERVAL_MS)),
      markerSize: Math.max(MIN_MARKER_SIZE, Math.min(MAX_MARKER_SIZE, patch.markerSize ?? prev.markerSize ?? DEFAULT_MARKER_SIZE)),
      alarmSound: patch.alarmSound ?? prev.alarmSound ?? "warning",
      continuousAlarm: patch.continuousAlarm ?? prev.continuousAlarm ?? true,
    }))
  }, [])

  const pushHistory = useCallback((entry: Omit<HistoryEntry, "id" | "at">) => {
    setHistory((prev) => [{ ...entry, id: uid(), at: Date.now(), ...entry }, ...prev].slice(0, 200))
  }, [])

  const evaluateGeofences = useCallback((pos: LatLng) => {
    const s = settingsRef.current
    const active = geofencesRef.current.filter((g) => g.active)
    const nowInside = active.filter((g) => distanceMeters(pos, g.center) <= g.radius).map((g) => g.id)
    const prevInside = insideRef.current
    for (const g of active) {
      const was = prevInside.includes(g.id)
      const is = nowInside.includes(g.id)
      if (!was && is && g.alertOnEnter) {
        pushHistory({ position: pos, speedKmh: 0, street: streetForIndex(stepCountRef.current), event: "geofence-enter", note: `Вход в геозону «${g.name}»` })
        if (s.soundEnabled) playAlarm(s.alarmSound, s.soundVolume)
      }
      if (was && !is && g.alertOnExit) {
        pushHistory({ position: pos, speedKmh: 0, street: streetForIndex(stepCountRef.current), event: "geofence-exit", note: `Выход из геозоны «${g.name}»` })
        if (s.soundEnabled) playAlarm(s.alarmSound, s.soundVolume)
      }
    }
    insideRef.current = nowInside
    setInsideGeofenceIds(nowInside)
  }, [pushHistory])

  const setRouteBuildState = useCallback((status: RouteBuildStatus, error?: string | null) => {
    setRouteStatus(status)
    if (error !== undefined) setRouteError(error)
    if (status !== "error" && error === undefined) setRouteError(null)
  }, [])

  const setRoutePathFromMap = useCallback((path: LatLng[]) => {
    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    streetTargetNodeRef.current = null
    setRoutePath(path)
    routePathRef.current = path
    if (path.length >= 2) {
      const start = path[0]
      setPosition(start)
      positionRef.current = start
      setHeading(calcBearing(start, path[1]))
      setSpeedKmh(0)
      setStreet(ROUTE_STREET_LABEL)
      setRouteStatus("ready")
      setRouteError(null)
      pushHistory({ position: start, speedKmh: 0, street: ROUTE_STREET_LABEL, event: "route", note: "Дорожный маршрут построен" })
      evaluateGeofences(start)
    }
  }, [evaluateGeofences, pushHistory])

  const updateRoutePointsText = useCallback((text: string) => {
    setRoutePointsText(text)
  }, [])

  const applyRoutePointsText = useCallback(() => {
    const parsed = parseRoutePoints(routePointsText)
    if (parsed.length < 2) {
      setRouteStatus("error")
      setRouteError("Нужно минимум две точки: старт и назначение")
      return
    }
    setRoutePoints(parsed)
    routePointsRef.current = parsed
    setRoutePath([])
    routePathRef.current = []
    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    streetTargetNodeRef.current = null
    const start = parsed[0]
    setPosition(start)
    positionRef.current = start
    setSpeedKmh(0)
    setStreet(ROUTE_STREET_LABEL)
    setRouteStatus("building")
    setRouteError(null)
    setSettings((prev) => ({ ...prev, routeMode: false, autoMove: true, scenarioEnabled: false }))
    pushHistory({ position: start, speedKmh: 0, street: ROUTE_STREET_LABEL, event: "route", note: "Точки маршрута применены" })
    evaluateGeofences(start)
  }, [evaluateGeofences, pushHistory, routePointsText])

  const startRouteEditor = useCallback((points?: LatLng[], routeId?: string | null) => {
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
      note: `Выбран маршрут «${route.name}»`,
    })

    evaluateGeofences(start)
  }, [evaluateGeofences, pushHistory])

  const renameSavedRoute = useCallback((routeId: string, name: string) => {
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

    const interpolationEnabled = options?.interpolationEnabled ?? existing?.interpolationEnabled ?? false
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
    const routeName = (options?.name ?? existing?.name ?? `Маршрут ${savedRoutesRef.current.length + 1}`).trim() || "Маршрут"
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

    setRoutePointsText(formatRoutePoints(builtPoints))
    setRoutePoints(builtPoints)
    routePointsRef.current = builtPoints

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
      note: `Сохранён маршрут «${routeName}»: ${sourcePoints.length} исходн. точ., ${builtPoints.length} итог. точ., шаг ${safeStepMeters} м, интервал ${safeIntervalMs} мс`,
    })

    evaluateGeofences(start)
  }, [evaluateGeofences, pushHistory, routeEditorEditingId, routeEditorPoints])

  const resetPosition = useCallback(() => {
    const start = KZ_SPB_ROUTE_POINTS[0]

    clearPersistedBeaconPosition()

    setPosition(start)
    positionRef.current = start
    currentNodeRef.current = nearestNode(start)
    streetTargetNodeRef.current = null
    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    setSpeedKmh(0)
    setStreet(ROUTE_STREET_LABEL)
    setMoving(false)
    setCenterRequest({ position: start, nonce: Date.now() })

    writePersistedBeaconPosition(start)

    pushHistory({
      position: start,
      speedKmh: 0,
      street: ROUTE_STREET_LABEL,
      event: "manual",
      note: "Положение маяка сброшено",
    })

    evaluateGeofences(start)
  }, [evaluateGeofences, pushHistory])

  const resetSettings = useCallback(() => {
    clearPersistedStoreState()
    clearPersistedBeaconPosition()

    const start = KZ_SPB_ROUTE_POINTS[0]

    setTheme("light")
    setLayers(DEFAULT_LAYERS)
    setZoomState(DEFAULT_ZOOM)
    setSettings(DEFAULT_SETTINGS)
    setRoutePointsText(DEFAULT_ROUTE_POINTS_TEXT)
    setRoutePoints(KZ_SPB_ROUTE_POINTS)
    setRoutePath([])
    setRouteStatus("idle")
    setRouteError(null)
    setPosition(start)
    setSpeedKmh(0)
    setStreet(ROUTE_STREET_LABEL)
    setMoving(false)

    positionRef.current = start
    currentNodeRef.current = nearestNode(start)
    streetTargetNodeRef.current = null
    routePointsRef.current = KZ_SPB_ROUTE_POINTS
    routePathRef.current = []
    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    streetTargetNodeRef.current = null
  }, [])

  const performStreetMove = useCallback((stepMeters: number): { next: LatLng; headingNext: number } => {
    let remaining = Math.max(0, stepMeters)
    let current = positionRef.current
    let currentNode = currentNodeRef.current
    let target = streetTargetNodeRef.current
    let headingNext = arrivalBearingRef.current

    if (remaining === 0) {
      return { next: current, headingNext }
    }

    while (remaining > 0) {
      if (!target) {
        const distanceToCurrentNode = distanceMeters(current, currentNode.pos)

        if (distanceToCurrentNode > 1) {
          // If the marker was placed manually away from the graph, first walk to the nearest road node.
          target = currentNode
          headingNext = calcBearing(current, target.pos)
        } else {
          const picked = pickNextNode(currentNode, arrivalBearingRef.current)
          target = picked.node
          headingNext = picked.exitBearing
          arrivalBearingRef.current = picked.exitBearing
        }

        streetTargetNodeRef.current = target
      }

      const distanceToTarget = distanceMeters(current, target.pos)

      if (distanceToTarget <= remaining) {
        remaining -= distanceToTarget
        current = target.pos
        currentNode = target
        currentNodeRef.current = target
        streetTargetNodeRef.current = null
        target = null
        continue
      }

      headingNext = calcBearing(current, target.pos)
      current = moveByDistance(current, remaining, headingNext)
      remaining = 0
    }

    return { next: current, headingNext }
  }, [])

  const performRouteMove = useCallback((stepMeters: number, intervalMs: number): LatLng | null => {
    const path = routePathRef.current
    if (path.length < 2) return null

    let cursor = { ...routeCursorRef.current }
    let remaining = Math.max(0, stepMeters)
    let next = positionRef.current

    if (remaining === 0) return next

    while (remaining > 0 && cursor.segmentIndex < path.length - 1) {
      const fromPoint = path[cursor.segmentIndex]
      const toPoint = path[cursor.segmentIndex + 1]
      const segmentLength = Math.max(0.01, distanceMeters(fromPoint, toPoint))
      const available = Math.max(0, segmentLength - cursor.offsetMeters)

      if (remaining <= available) {
        cursor.offsetMeters += remaining
        next = interpolateLatLng(fromPoint, toPoint, cursor.offsetMeters / segmentLength)
        remaining = 0
      } else {
        remaining -= available
        cursor.segmentIndex += 1
        cursor.offsetMeters = 0
        next = path[cursor.segmentIndex]
      }
    }

    if (cursor.segmentIndex >= path.length - 1) {
      const end = path[path.length - 1]
      if (settingsRef.current.routeLoop) {
        cursor = { segmentIndex: 0, offsetMeters: 0 }
        next = path[0]
      } else {
        cursor = { segmentIndex: path.length - 1, offsetMeters: 0 }
        next = end
        setSettings((prev) => ({ ...prev, autoMove: true, scenarioEnabled: false }))
        setMoving(false)
        pushHistory({ position: end, speedKmh: 0, street: ROUTE_STREET_LABEL, event: "stop", note: "Маяк дошёл до точки назначения" })
      }
    }

    routeCursorRef.current = cursor
    return next
  }, [pushHistory])

  const performMove = useCallback(() => {
    const s = settingsRef.current
    const from = positionRef.current
    let next: LatLng
    let headingNext = heading

    if (s.routeMode) {
      const routeNext = performRouteMove(s.stepMeters, s.intervalMs)
      if (!routeNext) {
        setRouteStatus("error")
        setRouteError("Маршрут ещё не построен. Проверьте точки и API Яндекс Карт.")
        return
      }
      next = routeNext
      if (distanceMeters(from, next) > 0.5) headingNext = calcBearing(from, next)
    } else if (s.followRoute) {
      const streetMove = performStreetMove(s.stepMeters)
      next = streetMove.next
      headingNext = streetMove.headingNext
    } else {
      headingNext = bearingFromDirection(s.direction)
      next = moveByDistance(from, s.stepMeters, headingNext)
    }

    const dist = distanceMeters(from, next)
    setPosition(next)
    positionRef.current = next
    writePersistedBeaconPosition(next)
    setHeading(headingNext)
    const currentSpeed = Math.round((dist / Math.max(1, s.intervalMs / 1000)) * 3.6)
    setSpeedKmh(currentSpeed)
    const streetName = s.routeMode ? ROUTE_STREET_LABEL : streetForIndex(++stepCountRef.current)
    setStreet(streetName)
    pushHistory({ position: next, speedKmh: currentSpeed, street: streetName, event: "move", note: s.routeMode ? "Движение по дорожному маршруту" : s.followRoute ? "Движение по улицам" : `Движение ${s.direction}` })
    if (s.soundEnabled && !s.continuousAlarm) playAlarm(s.alarmSound, s.soundVolume)
    evaluateGeofences(next)
  }, [evaluateGeofences, heading, performRouteMove, performStreetMove, pushHistory])

  const moveOnce = useCallback(() => performMove(), [performMove])
  const placeBeacon = useCallback((pos: LatLng) => {
    setPosition(pos)
    positionRef.current = pos
    writePersistedBeaconPosition(pos)
    currentNodeRef.current = nearestNode(pos)
    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    streetTargetNodeRef.current = null
    setSpeedKmh(0)
    const streetName = settingsRef.current.routeMode ? ROUTE_STREET_LABEL : streetForIndex(++stepCountRef.current)
    setStreet(streetName)
    pushHistory({ position: pos, speedKmh: 0, street: streetName, event: "manual", note: "Маяк установлен вручную" })
    evaluateGeofences(pos)
  }, [evaluateGeofences, pushHistory])

  useEffect(() => {
    if (!storageReady) return
    if (persistedPositionLoadedRef.current) return
    if (!canUseBrowserGeolocation()) return
    if (wasInitialGeolocationUsed()) return

    markInitialGeolocationUsed()

    navigator.geolocation.getCurrentPosition(
      (geoPosition) => {
        const next: LatLng = [
          geoPosition.coords.latitude,
          geoPosition.coords.longitude,
        ]

        setPosition(next)
        positionRef.current = next
        currentNodeRef.current = nearestNode(next)
        streetTargetNodeRef.current = null
        routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    streetTargetNodeRef.current = null
        setSpeedKmh(0)
        setStreet(USER_LOCATION_STREET_LABEL)
        setCenterRequest({ position: next, nonce: Date.now() })
        pushHistory({
          position: next,
          speedKmh: 0,
          street: USER_LOCATION_STREET_LABEL,
          event: "manual",
          note: "Маяк установлен по текущему местоположению при входе",
        })
        evaluateGeofences(next)
      },
      () => {
        // Permission denied, timeout, or unsupported provider: keep default app behavior.
      },
      {
        enableHighAccuracy: false,
        timeout: 4500,
        maximumAge: 10 * 60 * 1000,
      }
    )
  }, [evaluateGeofences, pushHistory, storageReady])

  useEffect(() => {
    if (!settings.autoMove || settings.scenarioEnabled) {
      setMoving(false)
      return
    }
    setMoving(true)
    const id = window.setInterval(performMove, settings.intervalMs)
    return () => {
      window.clearInterval(id)
      setMoving(false)
    }
  }, [settings.autoMove, settings.intervalMs, settings.scenarioEnabled, performMove])

  useEffect(() => {
    if (!settings.scheduledMove) return
    const id = window.setInterval(() => {
      const [hh, mm] = settingsRef.current.scheduleAt.split(":").map(Number)
      const now = new Date()
      if (now.getHours() === hh && now.getMinutes() === mm && now.getSeconds() < 2) performMove()
    }, 1000)
    return () => window.clearInterval(id)
  }, [performMove, settings.scheduledMove])

  useEffect(() => {
    if (!settings.scenarioEnabled || !settings.activeScenarioId) return
    const scenario = scenarios.find((s) => s.id === settings.activeScenarioId)
    if (!scenario || scenario.steps.length === 0) return
    let cancelled = false
    let index = 0
    setMoving(true)
    const run = () => {
      if (cancelled) return
      const step = scenario.steps[index]
      window.setTimeout(() => {
        if (cancelled) return
        const prev = settingsRef.current
        settingsRef.current = {
          ...prev,
          followRoute: step.direction == null,
          routeMode: step.direction == null ? prev.routeMode : false,
          direction: step.direction ?? prev.direction,
          stepMeters: step.stepMeters,
        }
        performMove()
        settingsRef.current = prev
        index += 1
        if (index >= scenario.steps.length) {
          if (scenario.loop) index = 0
          else {
            setSettings((prevSettings) => ({ ...prevSettings, scenarioEnabled: false }))
            setMoving(false)
            return
          }
        }
        run()
      }, step.delayMs)
    }
    run()
    return () => {
      cancelled = true
      setMoving(false)
    }
  }, [settings.scenarioEnabled, settings.activeScenarioId, scenarios, performMove])

  const addGeofence = useCallback(() => setGeofences((prev) => [...prev, { id: uid(), name: `Геозона ${prev.length + 1}`, center: positionRef.current, radius: 500, active: true, color: "#22d3ee", alertOnEnter: true, alertOnExit: true }]), [])
  const updateGeofence = useCallback((id: string, patch: Partial<Geofence>) => setGeofences((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g))), [])
  const removeGeofence = useCallback((id: string) => setGeofences((prev) => prev.filter((g) => g.id !== id)), [])
  const clearHistory = useCallback(() => setHistory([]), [])

  const addScenario = useCallback(() => setScenarios((prev) => [...prev, { id: uid(), name: `Сценарий ${prev.length + 1}`, loop: true, steps: [{ id: uid(), delayMs: 1000, stepMeters: 5, direction: null }] }]), [])
  const updateScenario = useCallback((id: string, patch: Partial<Omit<Scenario, "id" | "steps">>) => setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s))), [])
  const removeScenario = useCallback((id?: string) => {
    if (!id) return
    setScenarios((prev) => prev.filter((s) => s.id !== id))
    setSettings((prev) => ({ ...prev, activeScenarioId: prev.activeScenarioId === id ? null : prev.activeScenarioId, scenarioEnabled: prev.activeScenarioId === id ? false : prev.scenarioEnabled }))
  }, [])
  const addScenarioStep = useCallback((scenarioId: string) => setScenarios((prev) => prev.map((s) => s.id === scenarioId ? { ...s, steps: [...s.steps, { id: uid(), delayMs: 1000, stepMeters: 5, direction: null }] } : s)), [])
  const updateScenarioStep = useCallback((scenarioId: string, stepId: string, patch: Partial<ScenarioStep>) => setScenarios((prev) => prev.map((s) => s.id === scenarioId ? { ...s, steps: s.steps.map((st) => st.id === stepId ? { ...st, ...patch } : st) } : s)), [])
  const removeScenarioStep = useCallback((scenarioId: string, stepId: string) => setScenarios((prev) => prev.map((s) => s.id === scenarioId ? { ...s, steps: s.steps.filter((st) => st.id !== stepId) } : s)), [])

  const value = useMemo<StoreValue>(() => ({
    theme,
    toggleTheme,
    activePanel,
    setActivePanel,
    layers,
    toggleLayer,
    zoom,
    setZoom,
    rotationMode,
    toggleRotationMode,
    heading,
    centerRequest,
    requestCenter,
    settings,
    updateSettings,
    resetSettings,
    resetPosition,
    position,
    speedKmh,
    street,
    moving,
    moveOnce,
    placeBeacon,
    objects,
    history,
    clearHistory,
    geofences,
    addGeofence,
    updateGeofence,
    removeGeofence,
    insideGeofenceIds,
    scenarios,
    addScenario,
    updateScenario,
    removeScenario,
    addScenarioStep,
    updateScenarioStep,
    removeScenarioStep,
    routePointsText,
    routePoints,
    routePath,
    routeStatus,
    routeError,
    routeEditorActive,
    routeEditorPoints,
    routeEditorEditingId,
    savedRoutes,
    activeRouteId,
    startRouteEditor,
    cancelRouteEditor,
    saveRouteEditor,
    addRouteEditorPoint,
    undoRouteEditorPoint,
    clearRouteEditorPoints,
    applySavedRoute,
    renameSavedRoute,
    deleteSavedRoute,
    updateRoutePointsText,
    applyRoutePointsText,
    setRoutePathFromMap,
    setRouteBuildState,
  }), [theme, toggleTheme, activePanel, layers, toggleLayer, zoom, setZoom, rotationMode, toggleRotationMode, heading, centerRequest, requestCenter, settings, updateSettings, resetSettings, resetPosition, position, speedKmh, street, moving, moveOnce, placeBeacon, objects, history, clearHistory, geofences, addGeofence, updateGeofence, removeGeofence, insideGeofenceIds, scenarios, addScenario, updateScenario, removeScenario, addScenarioStep, updateScenarioStep, removeScenarioStep, routePointsText, routePoints, routePath, routeStatus, routeError, routeEditorActive, routeEditorPoints, routeEditorEditingId, savedRoutes, activeRouteId, startRouteEditor, cancelRouteEditor, saveRouteEditor, addRouteEditorPoint, undoRouteEditorPoint, clearRouteEditorPoints, applySavedRoute, renameSavedRoute, deleteSavedRoute, updateRoutePointsText, applyRoutePointsText, setRoutePathFromMap, setRouteBuildState])

  return <StoreContext value={value}>{children}</StoreContext>
}
