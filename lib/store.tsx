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
const ROUTE_STREET_LABEL = "Маршрут Казахстан → Санкт-Петербург"
const USER_LOCATION_STREET_LABEL = "Текущее местоположение"
const INITIAL_GEOLOCATION_DONE_KEY = "map-tracker:initial-geolocation-done"

type RouteCursor = {
  segmentIndex: number
  offsetMeters: number
}

const DEFAULT_SETTINGS: BeaconSettings = {
  visible: true,
  autoMove: false,
  intervalMs: DEFAULT_INTERVAL_MS,
  stepMeters: 18,
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
  beaconColor: LIGHT_DEFAULT_BEACON_COLOR,
  markerSize: DEFAULT_MARKER_SIZE,
  panelWidth: 340,
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

const DEFAULT_SCENARIOS: Scenario[] = [
  {
    id: "sc-kz-spb",
    name: "Казахстан → Санкт-Петербург",
    loop: false,
    steps: [
      { id: uid(), delayMs: 1000, stepMeters: 18000, direction: null },
      { id: uid(), delayMs: 1000, stepMeters: 18000, direction: null },
      { id: uid(), delayMs: 2500, stepMeters: 0, direction: null },
      { id: uid(), delayMs: 1000, stepMeters: 22000, direction: null },
    ],
  },
  {
    id: "sc-patrol",
    name: "Патруль",
    loop: true,
    steps: [
      { id: uid(), delayMs: 1000, stepMeters: 20, direction: null },
      { id: uid(), delayMs: 1000, stepMeters: 20, direction: null },
      { id: uid(), delayMs: 3000, stepMeters: 5, direction: null },
      { id: uid(), delayMs: 1000, stepMeters: 20, direction: null },
      { id: uid(), delayMs: 5000, stepMeters: 0, direction: null },
    ],
  },
  {
    id: "sc-fast",
    name: "Быстрое движение",
    loop: true,
    steps: [
      { id: uid(), delayMs: 500, stepMeters: 60, direction: null },
      { id: uid(), delayMs: 500, stepMeters: 60, direction: null },
      { id: uid(), delayMs: 500, stepMeters: 60, direction: null },
      { id: uid(), delayMs: 500, stepMeters: 60, direction: null },
      { id: uid(), delayMs: 2000, stepMeters: 10, direction: null },
    ],
  },
  {
    id: "sc-stop-go",
    name: "Стой-иди",
    loop: true,
    steps: [
      { id: uid(), delayMs: 2000, stepMeters: 30, direction: null },
      { id: uid(), delayMs: 8000, stepMeters: 0, direction: null },
      { id: uid(), delayMs: 2000, stepMeters: 30, direction: null },
      { id: uid(), delayMs: 8000, stepMeters: 0, direction: null },
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
  const [storageReady, setStorageReady] = useState(false)

  const stepCountRef = useRef(0)
  const currentNodeRef = useRef(nearestNode(SPB_ROUTE[0]))
  const arrivalBearingRef = useRef(45)
  const routeCursorRef = useRef<RouteCursor>({ segmentIndex: 0, offsetMeters: 0 })
  const settingsRef = useRef(settings)
  const positionRef = useRef(position)
  const insideRef = useRef<string[]>(insideGeofenceIds)
  const geofencesRef = useRef(geofences)
  const routePathRef = useRef(routePath)
  const routePointsRef = useRef(routePoints)
  settingsRef.current = settings
  positionRef.current = position
  insideRef.current = insideGeofenceIds
  geofencesRef.current = geofences
  routePathRef.current = routePath
  routePointsRef.current = routePoints



  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    root.classList.toggle("light", theme === "light")
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--beacon-pulse-duration", `${settings.pulseDurationMs}ms`)
    root.style.setProperty("--beacon-pulse-scale", String(settings.pulseScale))
    root.style.setProperty("--map-hue", `${settings.mapHue}deg`)
    root.style.setProperty("--beacon-user-color", settings.beaconColor)
    root.style.setProperty("--beacon-marker-size", `${settings.markerSize ?? DEFAULT_MARKER_SIZE}px`)
  }, [settings.pulseDurationMs, settings.pulseScale, settings.mapHue, settings.beaconColor, settings.markerSize])

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
    const start = parsed[0]
    setPosition(start)
    positionRef.current = start
    setSpeedKmh(0)
    setStreet(ROUTE_STREET_LABEL)
    setRouteStatus("building")
    setRouteError(null)
    setSettings((prev) => ({ ...prev, routeMode: true, autoMove: false, scenarioEnabled: false }))
    pushHistory({ position: start, speedKmh: 0, street: ROUTE_STREET_LABEL, event: "route", note: "Точки маршрута применены" })
    evaluateGeofences(start)
  }, [evaluateGeofences, pushHistory, routePointsText])

  const resetSettings = useCallback(() => {
    clearPersistedStoreState()

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
    routePointsRef.current = KZ_SPB_ROUTE_POINTS
    routePathRef.current = []
    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
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
        setSettings((prev) => ({ ...prev, autoMove: false, scenarioEnabled: false }))
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
      const node = currentNodeRef.current
      const picked = pickNextNode(node, arrivalBearingRef.current)
      currentNodeRef.current = picked.node
      next = picked.node.pos
      headingNext = picked.exitBearing
      arrivalBearingRef.current = picked.exitBearing
    } else {
      headingNext = bearingFromDirection(s.direction)
      next = moveByDistance(from, s.stepMeters, headingNext)
    }

    const dist = distanceMeters(from, next)
    setPosition(next)
    positionRef.current = next
    setHeading(headingNext)
    const currentSpeed = Math.round((dist / Math.max(1, s.intervalMs / 1000)) * 3.6)
    setSpeedKmh(currentSpeed)
    const streetName = s.routeMode ? ROUTE_STREET_LABEL : streetForIndex(++stepCountRef.current)
    setStreet(streetName)
    pushHistory({ position: next, speedKmh: currentSpeed, street: streetName, event: "move", note: s.routeMode ? "Движение по дорожному маршруту" : s.followRoute ? "Движение по улицам" : `Движение ${s.direction}` })
    if (s.soundEnabled && !s.continuousAlarm) playAlarm(s.alarmSound, s.soundVolume)
    evaluateGeofences(next)
  }, [evaluateGeofences, heading, performRouteMove, pushHistory])

  const moveOnce = useCallback(() => performMove(), [performMove])
  const placeBeacon = useCallback((pos: LatLng) => {
    setPosition(pos)
    positionRef.current = pos
    currentNodeRef.current = nearestNode(pos)
    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    setSpeedKmh(0)
    const streetName = settingsRef.current.routeMode ? ROUTE_STREET_LABEL : streetForIndex(++stepCountRef.current)
    setStreet(streetName)
    pushHistory({ position: pos, speedKmh: 0, street: streetName, event: "manual", note: "Маяк установлен вручную" })
    evaluateGeofences(pos)
  }, [evaluateGeofences, pushHistory])

  useEffect(() => {
    if (!storageReady) return
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
        routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
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

  const addScenario = useCallback(() => setScenarios((prev) => [...prev, { id: uid(), name: `Сценарий ${prev.length + 1}`, loop: true, steps: [{ id: uid(), delayMs: 1000, stepMeters: 20, direction: null }] }]), [])
  const updateScenario = useCallback((id: string, patch: Partial<Omit<Scenario, "id" | "steps">>) => setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s))), [])
  const removeScenario = useCallback((id?: string) => {
    if (!id) return
    setScenarios((prev) => prev.filter((s) => s.id !== id))
    setSettings((prev) => ({ ...prev, activeScenarioId: prev.activeScenarioId === id ? null : prev.activeScenarioId, scenarioEnabled: prev.activeScenarioId === id ? false : prev.scenarioEnabled }))
  }, [])
  const addScenarioStep = useCallback((scenarioId: string) => setScenarios((prev) => prev.map((s) => s.id === scenarioId ? { ...s, steps: [...s.steps, { id: uid(), delayMs: 1000, stepMeters: 20, direction: null }] } : s)), [])
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
    updateRoutePointsText,
    applyRoutePointsText,
    setRoutePathFromMap,
    setRouteBuildState,
  }), [theme, toggleTheme, activePanel, layers, toggleLayer, zoom, setZoom, rotationMode, toggleRotationMode, heading, centerRequest, requestCenter, settings, updateSettings, resetSettings, position, speedKmh, street, moving, moveOnce, placeBeacon, objects, history, clearHistory, geofences, addGeofence, updateGeofence, removeGeofence, insideGeofenceIds, scenarios, addScenario, updateScenario, removeScenario, addScenarioStep, updateScenarioStep, removeScenarioStep, routePointsText, routePoints, routePath, routeStatus, routeError, updateRoutePointsText, applyRoutePointsText, setRoutePathFromMap, setRouteBuildState])

  return <StoreContext value={value}>{children}</StoreContext>
}
