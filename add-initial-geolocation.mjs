import fs from "node:fs"

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Cannot find block: ${label}`)
  }
  return content.replace(search, replacement)
}

const storeFile = "lib/store.tsx"
let store = fs.readFileSync(storeFile, "utf8").replace(/\r\n/g, "\n")

if (!store.includes("INITIAL_GEOLOCATION_DONE_KEY")) {
  store = replaceOnce(
    store,
    `const ROUTE_STREET_LABEL = "Маршрут Казахстан → Санкт-Петербург"`,
    `const ROUTE_STREET_LABEL = "Маршрут Казахстан → Санкт-Петербург"
const USER_LOCATION_STREET_LABEL = "Текущее местоположение"
const INITIAL_GEOLOCATION_DONE_KEY = "map-tracker:initial-geolocation-done"`,
    "add initial geolocation constants"
  )
}

if (!store.includes("function canUseBrowserGeolocation")) {
  const anchor = store.includes("function clearPersistedStoreState()")
    ? `function clearPersistedStoreState() {
  if (typeof window === "undefined") return

  try {
    window.localStorage.removeItem(PERSISTED_STORE_KEY)
  } catch {}
}`
    : `function parseRoutePoints(text: string): LatLng[] {
  return text`

  const helper = store.includes("function clearPersistedStoreState()")
    ? `function clearPersistedStoreState() {
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
}`
    : `function canUseBrowserGeolocation() {
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

function parseRoutePoints(text: string): LatLng[] {
  return text`

  store = replaceOnce(store, anchor, helper, "add geolocation helpers")
}

if (!store.includes("navigator.geolocation.getCurrentPosition")) {
  store = replaceOnce(
    store,
    `  useEffect(() => {
    const root = document.documentElement`,
    `  useEffect(() => {
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
    const root = document.documentElement`,
    "add one-shot initial geolocation effect"
  )
}

fs.writeFileSync(storeFile, store, "utf8")

console.log("One-shot initial geolocation enabled")
