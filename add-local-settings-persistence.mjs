import fs from "node:fs"

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Cannot find block: ${label}`)
  }
  return content.replace(search, replacement)
}

const storeFile = "lib/store.tsx"
const settingsFile = "components/panels/settings-panel.tsx"

let store = fs.readFileSync(storeFile, "utf8").replace(/\r\n/g, "\n")
let settingsPanel = fs.readFileSync(settingsFile, "utf8").replace(/\r\n/g, "\n")

if (!store.includes("PERSISTED_STORE_KEY")) {
  store = replaceOnce(
    store,
    `const DEFAULT_SCENARIOS: Scenario[] = [`,
    `const DEFAULT_ZOOM = 5

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
  } catch {}
}

const DEFAULT_SCENARIOS: Scenario[] = [`,
    "persisted store helpers"
  )
}

if (!store.includes("resetSettings: () => void")) {
  store = replaceOnce(
    store,
    `  updateSettings: (patch: Partial<BeaconSettings>) => void
  position: LatLng`,
    `  updateSettings: (patch: Partial<BeaconSettings>) => void
  resetSettings: () => void
  position: LatLng`,
    "StoreValue resetSettings"
  )
}

store = store.replace(
  `const [layers, setLayers] = useState<Record<MapLayer, boolean>>({ traffic: false, transport: false, roads: true, labels: true, buildings: true })`,
  `const [layers, setLayers] = useState<Record<MapLayer, boolean>>(DEFAULT_LAYERS)`
)

store = store.replace(
  `const [zoom, setZoomState] = useState(5)`,
  `const [zoom, setZoomState] = useState(DEFAULT_ZOOM)`
)

if (!store.includes("const [storageReady, setStorageReady] = useState(false)")) {
  store = replaceOnce(
    store,
    `  const [routeStatus, setRouteStatus] = useState<RouteBuildStatus>("idle")
  const [routeError, setRouteError] = useState<string | null>(null)`,
    `  const [routeStatus, setRouteStatus] = useState<RouteBuildStatus>("idle")
  const [routeError, setRouteError] = useState<string | null>(null)
  const [storageReady, setStorageReady] = useState(false)`,
    "storageReady state"
  )
}

if (!store.includes("readPersistedStoreState()")) {
  store = replaceOnce(
    store,
    `  routePathRef.current = routePath
  routePointsRef.current = routePoints

  useEffect(() => {`,
    `  routePathRef.current = routePath
  routePointsRef.current = routePoints

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
        }
      }
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
  }, [storageReady, theme, layers, zoom, settings, routePointsText])

  useEffect(() => {`,
    "load and persist settings effects"
  )
}

if (!store.includes("const resetSettings = useCallback(() =>")) {
  store = replaceOnce(
    store,
    `  }, [evaluateGeofences, pushHistory, routePointsText])

  const performRouteMove = useCallback((stepMeters: number, intervalMs: number): LatLng | null => {`,
    `  }, [evaluateGeofences, pushHistory, routePointsText])

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

  const performRouteMove = useCallback((stepMeters: number, intervalMs: number): LatLng | null => {`,
    "resetSettings callback"
  )
}

if (!store.includes("    resetSettings,")) {
  store = replaceOnce(
    store,
    `    settings,
    updateSettings,
    position,`,
    `    settings,
    updateSettings,
    resetSettings,
    position,`,
    "resetSettings value"
  )

  store = replaceOnce(
    store,
    `settings, updateSettings, position,`,
    `settings, updateSettings, resetSettings, position,`,
    "resetSettings dependency"
  )
}

if (!settingsPanel.includes("resetSettings,")) {
  settingsPanel = replaceOnce(
    settingsPanel,
    `    settings,
    updateSettings,
    theme,`,
    `    settings,
    updateSettings,
    resetSettings,
    theme,`,
    "settings panel destructure resetSettings"
  )
}

if (!settingsPanel.includes("Сбросить настройки")) {
  settingsPanel = replaceOnce(
    settingsPanel,
    `          <DisplayModeSettings />

          <Section title="Интерфейс">`,
    `          <DisplayModeSettings />

          <Section title="Сброс">
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Возвращает тему, карту, маршрут, маяк, звук, пульсацию, интервалы и остальные параметры к значениям по умолчанию. Локально сохранённые настройки тоже очищаются.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (typeof window === "undefined" || window.confirm("Сбросить все локальные настройки?")) {
                    resetSettings()
                  }
                }}
                className="w-full rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/15 active:scale-[0.98]"
              >
                Сбросить настройки
              </button>
            </div>
          </Section>

          <Section title="Интерфейс">`,
    "reset settings section"
  )
}

fs.writeFileSync(storeFile, store, "utf8")
fs.writeFileSync(settingsFile, settingsPanel, "utf8")

console.log("Local settings persistence and reset button added")
