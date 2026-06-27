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

// Smaller default movement step.
store = store.replace(
  `  stepMeters: 18,`,
  `  stepMeters: 5,`
)

// Keep route mode disabled by default, in case old scripts touched it.
store = store.replace(
  `  routeMode: true,`,
  `  routeMode: false,`
)

// Add a target node ref for smooth local street movement.
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

// Add smooth local road movement.
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

  const performRouteMove = useCallback((stepMeters: number, intervalMs: number): LatLng | null => {`,
    "smooth street movement callback"
  )
}

// Replace jumping node movement with smooth segment movement.
if (store.includes(`    } else if (s.followRoute) {
      const node = currentNodeRef.current
      const picked = pickNextNode(node, arrivalBearingRef.current)
      currentNodeRef.current = picked.node
      next = picked.node.pos
      headingNext = picked.exitBearing
      arrivalBearingRef.current = picked.exitBearing
    } else {`)) {
  store = replaceOnce(
    store,
    `    } else if (s.followRoute) {
      const node = currentNodeRef.current
      const picked = pickNextNode(node, arrivalBearingRef.current)
      currentNodeRef.current = picked.node
      next = picked.node.pos
      headingNext = picked.exitBearing
      arrivalBearingRef.current = picked.exitBearing
    } else {`,
    `    } else if (s.followRoute) {
      const streetMove = performStreetMove(s.stepMeters)
      next = streetMove.next
      headingNext = streetMove.headingNext
    } else {`,
    "replace jumping street movement"
  )
}

store = store.replace(
  `  }, [evaluateGeofences, heading, performRouteMove, pushHistory])`,
  `  }, [evaluateGeofences, heading, performRouteMove, performStreetMove, pushHistory])`
)

// Reset local street target when position is manually changed or route state resets.
store = store.replaceAll(
  `routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }`,
  `routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }
    streetTargetNodeRef.current = null`
)

// Avoid duplicate insertion if script runs twice.
store = store.replaceAll(
  `streetTargetNodeRef.current = null
    streetTargetNodeRef.current = null`,
  `streetTargetNodeRef.current = null`
)

// Make resetSettings restore current road graph node correctly.
if (store.includes(`    positionRef.current = start
    routePointsRef.current = KZ_SPB_ROUTE_POINTS`)) {
  store = store.replace(
    `    positionRef.current = start
    routePointsRef.current = KZ_SPB_ROUTE_POINTS`,
    `    positionRef.current = start
    currentNodeRef.current = nearestNode(start)
    streetTargetNodeRef.current = null
    routePointsRef.current = KZ_SPB_ROUTE_POINTS`
  )
}

// Make startup geolocation road movement continue from nearest road smoothly.
if (store.includes(`        currentNodeRef.current = nearestNode(next)
        routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }`)) {
  store = store.replace(
    `        currentNodeRef.current = nearestNode(next)
        routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }`,
    `        currentNodeRef.current = nearestNode(next)
        streetTargetNodeRef.current = null
        routeCursorRef.current = { segmentIndex: 0, offsetMeters: 0 }`
  )
}

// Improve slider precision for small movement.
settingsPanel = settingsPanel.replace(
  `<SliderRow label="Шаг перемещения" value={settings.stepMeters} display={\`\${settings.stepMeters} м\`} min={10} max={30000} step={10} onChange={(v) => updateSettings({ stepMeters: v })} />`,
  `<SliderRow label="Шаг перемещения" value={settings.stepMeters} display={\`\${settings.stepMeters} м\`} min={1} max={30000} step={1} onChange={(v) => updateSettings({ stepMeters: v })} />`
)

fs.writeFileSync(storeFile, store, "utf8")
fs.writeFileSync(settingsPanelFile, settingsPanel, "utf8")

console.log("Default step reduced and street movement smoothed")
