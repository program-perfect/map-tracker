import fs from "node:fs"

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Cannot find block: ${label}`)
  }
  return content.replace(search, replacement)
}

const storeFile = "lib/store.tsx"
const settingsPanelFile = "components/panels/settings-panel.tsx"

let store = fs.readFileSync(storeFile, "utf8").replace(/\r\n/g, "\n")
let settingsPanel = fs.readFileSync(settingsPanelFile, "utf8").replace(/\r\n/g, "\n")

const hasStreetTarget = store.includes("streetTargetNodeRef")
const clearStreetTargetLine = hasStreetTarget ? "    streetTargetNodeRef.current = null\n" : ""
const clearStreetTargetLineDeep = hasStreetTarget ? "        streetTargetNodeRef.current = null\n" : ""

// ---------- lib/store.tsx ----------

if (!store.includes("PERSISTED_BEACON_POSITION_KEY")) {
  store = replaceOnce(
    store,
    `const ROUTE_STREET_LABEL = "Маршрут Казахстан → Санкт-Петербург"`,
    `const ROUTE_STREET_LABEL = "Маршрут Казахстан → Санкт-Петербург"
const PERSISTED_BEACON_POSITION_KEY = "map-tracker:beacon-position:v1"`,
    "beacon position storage key"
  )
}

if (!store.includes("function readPersistedBeaconPosition")) {
  store = replaceOnce(
    store,
    `const DEFAULT_SCENARIOS: Scenario[] = [`,
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

const DEFAULT_SCENARIOS: Scenario[] = [`,
    "beacon position persistence helpers"
  )
}

if (!store.includes("resetPosition: () => void")) {
  store = replaceOnce(
    store,
    `  resetSettings: () => void
  position: LatLng`,
    `  resetSettings: () => void
  resetPosition: () => void
  position: LatLng`,
    "StoreValue.resetPosition"
  )
}

if (!store.includes("persistedPositionLoadedRef")) {
  store = replaceOnce(
    store,
    `  const positionRef = useRef(position)`,
    `  const positionRef = useRef(position)
  const persistedPositionLoadedRef = useRef(false)`,
    "persisted position ref"
  )
}

if (!store.includes("readPersistedBeaconPosition()")) {
  const saveEffect = store.includes("const [storageReady")
    ? `  useEffect(() => {
    if (!storageReady) return
    writePersistedBeaconPosition(position)
  }, [storageReady, position])`
    : `  useEffect(() => {
    writePersistedBeaconPosition(position)
  }, [position])`

  const effectsBlock = `  useEffect(() => {
    const restoredPosition = readPersistedBeaconPosition()
    if (!restoredPosition) return

    persistedPositionLoadedRef.current = true

    setPosition(restoredPosition)
    positionRef.current = restoredPosition
    currentNodeRef.current = nearestNode(restoredPosition)
${clearStreetTargetLine}    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    setSpeedKmh(0)
    setStreet("Сохранённая позиция")
    setCenterRequest({ position: restoredPosition, nonce: Date.now() })
  }, [])

${saveEffect}

`

  store = replaceOnce(
    store,
    `  routePathRef.current = routePath
  routePointsRef.current = routePoints

`,
    `  routePathRef.current = routePath
  routePointsRef.current = routePoints

${effectsBlock}`,
    "restore/save beacon position effects"
  )
}

if (
  store.includes(`if (!storageReady) return
    if (!canUseBrowserGeolocation()) return`) &&
  !store.includes(`if (persistedPositionLoadedRef.current) return`)
) {
  store = replaceOnce(
    store,
    `if (!storageReady) return
    if (!canUseBrowserGeolocation()) return`,
    `if (!storageReady) return
    if (persistedPositionLoadedRef.current) return
    if (!canUseBrowserGeolocation()) return`,
    "skip startup geolocation when saved position exists"
  )
} else if (
  store.includes(`if (!canUseBrowserGeolocation()) return`) &&
  !store.includes(`if (persistedPositionLoadedRef.current) return`)
) {
  store = replaceOnce(
    store,
    `if (!canUseBrowserGeolocation()) return`,
    `if (persistedPositionLoadedRef.current) return
    if (!canUseBrowserGeolocation()) return`,
    "skip startup geolocation fallback"
  )
}

if (!store.includes("const resetPosition = useCallback")) {
  store = replaceOnce(
    store,
    `  const resetSettings = useCallback(() => {`,
    `  const resetPosition = useCallback(() => {
    const start = KZ_SPB_ROUTE_POINTS[0]

    clearPersistedBeaconPosition()

    setPosition(start)
    positionRef.current = start
    currentNodeRef.current = nearestNode(start)
${clearStreetTargetLine}    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
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

  const resetSettings = useCallback(() => {`,
    "resetPosition callback"
  )
}

if (store.includes(`  const resetSettings = useCallback(() => {
    clearPersistedStoreState()`) && !store.includes(`clearPersistedBeaconPosition()

    const start = KZ_SPB_ROUTE_POINTS[0]`)) {
  store = replaceOnce(
    store,
    `  const resetSettings = useCallback(() => {
    clearPersistedStoreState()`,
    `  const resetSettings = useCallback(() => {
    clearPersistedStoreState()
    clearPersistedBeaconPosition()`,
    "clear position during full reset"
  )
}

if (!store.includes("setCenterRequest({ position: start, nonce: Date.now() })")) {
  store = replaceOnce(
    store,
    `    setMoving(false)

    positionRef.current = start`,
    `    setMoving(false)
    setCenterRequest({ position: start, nonce: Date.now() })

    positionRef.current = start`,
    "center after full reset"
  )
}

if (
  store.includes(`    positionRef.current = start
    routePointsRef.current = KZ_SPB_ROUTE_POINTS`) &&
  !store.includes(`    currentNodeRef.current = nearestNode(start)
${clearStreetTargetLine}    routePointsRef.current = KZ_SPB_ROUTE_POINTS`)
) {
  store = replaceOnce(
    store,
    `    positionRef.current = start
    routePointsRef.current = KZ_SPB_ROUTE_POINTS`,
    `    positionRef.current = start
    currentNodeRef.current = nearestNode(start)
${clearStreetTargetLine}    routePointsRef.current = KZ_SPB_ROUTE_POINTS`,
    "reset current node after full reset"
  )
}

if (!store.includes("writePersistedBeaconPosition(start)")) {
  store = replaceOnce(
    store,
    `    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
  }, [])`,
    `    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
${clearStreetTargetLineDeep}    writePersistedBeaconPosition(start)
  }, [])`,
    "persist resetSettings start position"
  )
}

if (!store.includes("    resetPosition,")) {
  store = replaceOnce(
    store,
    `    resetSettings,
    position,`,
    `    resetSettings,
    resetPosition,
    position,`,
    "store value resetPosition"
  )
}

store = store.replace(
  `resetSettings, position,`,
  `resetSettings, resetPosition, position,`
)

// ---------- components/panels/settings-panel.tsx ----------

if (!settingsPanel.includes(`import { useState } from "react"`)) {
  settingsPanel = settingsPanel.replace(
    `"use client"\n`,
    `"use client"\n\nimport { useState } from "react"\n`
  )
}

if (!settingsPanel.includes("resetPosition,")) {
  settingsPanel = replaceOnce(
    settingsPanel,
    `    resetSettings,`,
    `    resetSettings,
    resetPosition,`,
    "settings panel resetPosition destructure"
  )
}

if (!settingsPanel.includes("resetDialogOpen")) {
  settingsPanel = replaceOnce(
    settingsPanel,
    `  const markerSize = Math.max(MIN_MARKER_SIZE, Math.min(MAX_MARKER_SIZE, settings.markerSize ?? MIN_MARKER_SIZE))`,
    `  const markerSize = Math.max(MIN_MARKER_SIZE, Math.min(MAX_MARKER_SIZE, settings.markerSize ?? MIN_MARKER_SIZE))
  const [resetDialogOpen, setResetDialogOpen] = useState(false)`,
    "reset dialog state"
  )
}

const resetSectionReplacement = `
          <Section title="Сброс">
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Положение точки сохраняется между сессиями. Его можно сбросить отдельно или вместе со всеми настройками.
              </p>

              <button
                type="button"
                onClick={resetPosition}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-semibold transition-colors hover:bg-accent active:scale-[0.98]"
              >
                Сбросить положение точки
              </button>

              <button
                type="button"
                onClick={() => setResetDialogOpen(true)}
                className="w-full rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/15 active:scale-[0.98]"
              >
                Сбросить все настройки
              </button>
            </div>
          </Section>

          <Section title="Интерфейс">`

const resetSectionRegex = /\s*<Section title="Сброс">[\s\S]*?<\/Section>\s*<Section title="Интерфейс">/

if (resetSectionRegex.test(settingsPanel)) {
  settingsPanel = settingsPanel.replace(resetSectionRegex, resetSectionReplacement)
} else if (!settingsPanel.includes("Сбросить положение точки")) {
  settingsPanel = replaceOnce(
    settingsPanel,
    `          <Section title="Интерфейс">`,
    resetSectionReplacement,
    "insert reset section"
  )
}

if (!settingsPanel.includes("Подтвердить сброс")) {
  settingsPanel = replaceOnce(
    settingsPanel,
    `      </ScrollArea>
    </div>`,
    `      </ScrollArea>

      {resetDialogOpen && (
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-settings-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl"
          >
            <h2 id="reset-settings-title" className="text-base font-semibold">
              Подтвердить сброс
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Будут сброшены все настройки, маршрут, звук, отображение и положение точки. Локально сохранённые данные будут перезаписаны значениями по умолчанию.
            </p>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setResetDialogOpen(false)}
                className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  resetSettings()
                  setResetDialogOpen(false)
                }}
                className="flex-1 rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Сбросить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>`,
    "centered reset confirmation dialog"
  )
}

fs.writeFileSync(storeFile, store, "utf8")
fs.writeFileSync(settingsPanelFile, settingsPanel, "utf8")

console.log("Persisted beacon position, separate position reset, and centered reset dialog added")
