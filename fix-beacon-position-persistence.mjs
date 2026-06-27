import fs from "node:fs"

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Cannot find block: ${label}`)
  }
  return content.replace(search, replacement)
}

const file = "lib/store.tsx"
let content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")

if (!content.includes("PERSISTED_BEACON_POSITION_KEY")) {
  content = replaceOnce(
    content,
    `const ROUTE_STREET_LABEL = "Маршрут Казахстан → Санкт-Петербург"`,
    `const ROUTE_STREET_LABEL = "Маршрут Казахстан → Санкт-Петербург"
const PERSISTED_BEACON_POSITION_KEY = "map-tracker:beacon-position:v1"`,
    "position storage key"
  )
}

if (!content.includes("function isValidBeaconPosition")) {
  content = replaceOnce(
    content,
    `function canUseBrowserGeolocation() {`,
    `function isValidBeaconPosition(value: unknown): value is LatLng {
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

function canUseBrowserGeolocation() {`,
    "position persistence helpers"
  )
}

if (!content.includes("persistedPositionLoadedRef")) {
  content = replaceOnce(
    content,
    `  const positionRef = useRef(position)`,
    `  const positionRef = useRef(position)
  const persistedPositionLoadedRef = useRef(false)`,
    "persisted position ref"
  )
}

if (!content.includes("POSITION_PERSISTENCE_BOOTSTRAP")) {
  const anchor = `  routePathRef.current = routePath
  routePointsRef.current = routePoints

`

  const block = `  // POSITION_PERSISTENCE_BOOTSTRAP
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

`

  content = replaceOnce(content, anchor, anchor + block, "insert position persistence effects")
}

if (
  content.includes(`if (!storageReady) return
    if (!canUseBrowserGeolocation()) return`) &&
  !content.includes(`if (persistedPositionLoadedRef.current) return`)
) {
  content = replaceOnce(
    content,
    `if (!storageReady) return
    if (!canUseBrowserGeolocation()) return`,
    `if (!storageReady) return
    if (persistedPositionLoadedRef.current) return
    if (!canUseBrowserGeolocation()) return`,
    "skip geolocation after restored position"
  )
}

if (!content.includes("writePersistedBeaconPosition(pos)")) {
  content = replaceOnce(
    content,
    `    setPosition(pos)
    positionRef.current = pos`,
    `    setPosition(pos)
    positionRef.current = pos
    writePersistedBeaconPosition(pos)`,
    "persist manual beacon placement immediately"
  )
}

if (!content.includes("writePersistedBeaconPosition(next)")) {
  content = replaceOnce(
    content,
    `    setPosition(next)
    positionRef.current = next`,
    `    setPosition(next)
    positionRef.current = next
    writePersistedBeaconPosition(next)`,
    "persist beacon movement immediately"
  )
}

if (
  content.includes(`clearPersistedStoreState()
    clearPersistedBeaconPosition()`) === false &&
  content.includes(`clearPersistedStoreState()`)
) {
  content = replaceOnce(
    content,
    `clearPersistedStoreState()`,
    `clearPersistedStoreState()
    clearPersistedBeaconPosition()`,
    "clear saved position with full reset"
  )
}

if (
  content.includes(`const resetPosition = useCallback`) &&
  !content.includes(`Положение маяка сброшено`) &&
  content.includes(`clearPersistedBeaconPosition()`)
) {
  // no-op safeguard for older local variants
}

fs.writeFileSync(file, content, "utf8")
console.log("Beacon position persistence is now actually connected")
