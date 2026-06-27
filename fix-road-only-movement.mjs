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

// Defaults like on your screenshot.
store = store.replace(/autoMove:\s*(true|false),/g, "autoMove: true,")
store = store.replace(/intervalMs:\s*[\d_]+,/g, "intervalMs: 1_000,")
store = store.replace(/stepMeters:\s*[\d_]+,/g, "stepMeters: 5,")
store = store.replace(/direction:\s*"[^"]+",/g, 'direction: "NE",')
store = store.replace(/followRoute:\s*(true|false),/g, "followRoute: true,")
store = store.replace(/routeMode:\s*(true|false),/g, "routeMode: false,")

// If marker is too far from the built-in local road graph, do not drag it through buildings.
if (!store.includes("ROAD_SNAP_MAX_METERS")) {
  store = replaceOnce(
    store,
    `const ROUTE_STREET_LABEL = "Маршрут Казахстан → Санкт-Петербург"`,
    `const ROUTE_STREET_LABEL = "Маршрут Казахстан → Санкт-Петербург"
const ROAD_SNAP_MAX_METERS = 2500`,
    "road snap constant"
  )
}

// Add road target ref.
if (!store.includes("streetTargetNodeRef")) {
  store = replaceOnce(
    store,
    `  const currentNodeRef = useRef(nearestNode(SPB_ROUTE[0]))
  const arrivalBearingRef = useRef(45)`,
    `  const currentNodeRef = useRef(nearestNode(SPB_ROUTE[0]))
  const streetTargetNodeRef = useRef<ReturnType<typeof nearestNode> | null>(null)
  const arrivalBearingRef = useRef(45)`,
    "street target ref"
  )
}

// Add smooth road movement.
if (!store.includes("const performStreetMove = useCallback")) {
  store = replaceOnce(
    store,
    `  const performRouteMove = useCallback((stepMeters: number, intervalMs: number): LatLng | null => {`,
    `  const performStreetMove = useCallback((stepMeters: number): { next: LatLng; headingNext: number } => {
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
        currentNode = nearestNode(current)
        currentNodeRef.current = currentNode

        const distanceToCurrentNode = distanceMeters(current, currentNode.pos)

        if (distanceToCurrentNode > ROAD_SNAP_MAX_METERS) {
          // We do not have a local road graph for this area.
          // Better to stop than to visibly drive through buildings.
          return { next: current, headingNext }
        }

        if (distanceToCurrentNode > 1) {
          // Snap to the closest road node first, instead of walking diagonally through blocks.
          current = currentNode.pos
          remaining = Math.max(0, remaining - Math.min(remaining, distanceToCurrentNode))
        }

        const picked = pickNextNode(currentNode, arrivalBearingRef.current)
        target = picked.node
        headingNext = picked.exitBearing
        arrivalBearingRef.current = picked.exitBearing
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

  const performRouteMove = useCallback((stepMeters: number, intervalMs: number): LatLng | null => {`,
    "smooth street movement"
  )
}

// Replace jump-to-node movement with smooth road movement.
const jumpBlock = `    } else if (s.followRoute) {
      const node = currentNodeRef.current
      const picked = pickNextNode(node, arrivalBearingRef.current)
      currentNodeRef.current = picked.node
      next = picked.node.pos
      headingNext = picked.exitBearing
      arrivalBearingRef.current = picked.exitBearing
    } else {`

if (store.includes(jumpBlock)) {
  store = replaceOnce(
    store,
    jumpBlock,
    `    } else if (s.followRoute) {
      const streetMove = performStreetMove(s.stepMeters)
      next = streetMove.next
      headingNext = streetMove.headingNext
    } else {`,
    "replace street jump movement"
  )
}

store = store.replace(
  `  }, [evaluateGeofences, heading, performRouteMove, pushHistory])`,
  `  }, [evaluateGeofences, heading, performRouteMove, performStreetMove, pushHistory])`
)

// Make manual placement snap to the local road graph when road movement is enabled.
const oldPlaceBeacon = `  const placeBeacon = useCallback((pos: LatLng) => {
    setPosition(pos)
    positionRef.current = pos
    currentNodeRef.current = nearestNode(pos)
    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    setSpeedKmh(0)
    const streetName = settingsRef.current.routeMode ? ROUTE_STREET_LABEL : streetForIndex(++stepCountRef.current)
    setStreet(streetName)
    pushHistory({ position: pos, speedKmh: 0, street: streetName, event: "manual", note: "Маяк установлен вручную" })
    evaluateGeofences(pos)
  }, [evaluateGeofences, pushHistory])`

if (store.includes(oldPlaceBeacon)) {
  store = replaceOnce(
    store,
    oldPlaceBeacon,
    `  const placeBeacon = useCallback((pos: LatLng) => {
    const shouldSnapToRoad = settingsRef.current.followRoute && !settingsRef.current.routeMode
    const nearestRoadNode = nearestNode(pos)
    const distanceToRoad = distanceMeters(pos, nearestRoadNode.pos)
    const nextPos = shouldSnapToRoad && distanceToRoad <= ROAD_SNAP_MAX_METERS ? nearestRoadNode.pos : pos

    setPosition(nextPos)
    positionRef.current = nextPos
    currentNodeRef.current = nearestRoadNode
    streetTargetNodeRef.current = null
    routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    setSpeedKmh(0)

    const streetName = settingsRef.current.routeMode ? ROUTE_STREET_LABEL : streetForIndex(++stepCountRef.current)
    setStreet(streetName)
    pushHistory({
      position: nextPos,
      speedKmh: 0,
      street: streetName,
      event: "manual",
      note: nextPos === pos ? "Маяк установлен вручную" : "Маяк установлен на ближайшую дорогу",
    })
    evaluateGeofences(nextPos)
  }, [evaluateGeofences, pushHistory])`,
    "snap manual placement to road"
  )
}

// Clear street target whenever route cursor is reset.
store = store.replaceAll(
  `routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }`,
  `routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    streetTargetNodeRef.current = null`
)

store = store.replaceAll(
  `streetTargetNodeRef.current = null
    streetTargetNodeRef.current = null`,
  `streetTargetNodeRef.current = null`
)

// Slider precision for tiny steps.
settingsPanel = settingsPanel.replace(
  `<SliderRow label="Шаг перемещения" value={settings.stepMeters} display={\`\${settings.stepMeters} м\`} min={10} max={30000} step={10} onChange={(v) => updateSettings({ stepMeters: v })} />`,
  `<SliderRow label="Шаг перемещения" value={settings.stepMeters} display={\`\${settings.stepMeters} м\`} min={1} max={30000} step={1} onChange={(v) => updateSettings({ stepMeters: v })} />`
)

fs.writeFileSync(storeFile, store, "utf8")
fs.writeFileSync(settingsPanelFile, settingsPanel, "utf8")

console.log("Road movement fixed: snap to roads + smooth segment movement")
