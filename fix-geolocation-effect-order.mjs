import fs from "node:fs"

const file = "lib/store.tsx"
let content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")

const effectStart = `  useEffect(() => {
    if (!storageReady) return
    if (!canUseBrowserGeolocation()) return
    if (wasInitialGeolocationUsed()) return`

const startIndex = content.indexOf(effectStart)
if (startIndex === -1) {
  throw new Error("Cannot find initial geolocation effect")
}

const effectEndMarker = `  }, [evaluateGeofences, pushHistory, storageReady])`
const endIndex = content.indexOf(effectEndMarker, startIndex)
if (endIndex === -1) {
  throw new Error("Cannot find initial geolocation effect end")
}

const fullEndIndex = endIndex + effectEndMarker.length
const effectBlock = content.slice(startIndex, fullEndIndex)

// remove wrong early effect
content = content.slice(0, startIndex) + content.slice(fullEndIndex)

// insert after placeBeacon, where pushHistory/evaluateGeofences already exist
const anchor = `  const placeBeacon = useCallback((pos: LatLng) => {
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

`

if (!content.includes(anchor)) {
  throw new Error("Cannot find placeBeacon anchor")
}

content = content.replace(anchor, anchor + effectBlock + "\n\n")

fs.writeFileSync(file, content, "utf8")
console.log("Moved initial geolocation effect after callback declarations")
