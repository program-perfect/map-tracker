import fs from "node:fs"

const file = "components/yandex-map.tsx"
let content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")

function replaceOnce(search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Cannot find block: ${label}`)
  }
  content = content.replace(search, replacement)
}

if (!content.includes("ROTATION_WHEEL_STEP_DEG")) {
  replaceOnce(
    `type Status = "loading" | "ready" | "error"`,
    `type Status = "loading" | "ready" | "error"

type PointerPosition = {
  x: number
  y: number
}

const ROTATION_WHEEL_STEP_DEG = 5
const ROTATION_WHEEL_SNAP_DEG = 45

function normalizeRotation(value: number) {
  return ((value % 360) + 360) % 360
}

function angleBetweenPointers(points: Map<number, PointerPosition>): number | null {
  const values = Array.from(points.values())
  if (values.length < 2) return null

  const [a, b] = values
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
}

function rotationCoverScale(rotationDeg: number) {
  const radians = Math.abs((normalizeRotation(rotationDeg) % 180) * Math.PI / 180)
  const folded = radians > Math.PI / 2 ? Math.PI - radians : radians

  // CSS rotation is a fallback for Yandex Maps 2.1, which has no native bearing.
  // Scale prevents black corners around 45°.
  return 1 + Math.sin(folded) * 0.88
}`,
    "insert rotation helpers"
  )
}

if (content.includes(`try { map.behaviors.disable(["scrollZoom", "rightMouseButtonMagnifier"]) } catch {}`)) {
  replaceOnce(
    `try { map.behaviors.disable(["scrollZoom", "rightMouseButtonMagnifier"]) } catch {}
        try { map.options.set("avoidFractionalZoom", true) } catch {}`,
    `try { map.behaviors.enable(["drag", "scrollZoom", "dblClickZoom", "multiTouch"]) } catch {}
        try { map.behaviors.disable(["rightMouseButtonMagnifier"]) } catch {}
        try { map.options.set("avoidFractionalZoom", true) } catch {}`,
    "enable map zoom gestures"
  )
}

if (!content.includes("rotationLayerRef")) {
  replaceOnce(
    `  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)`,
    `  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const rotationLayerRef = useRef<HTMLDivElement>(null)`,
    "insert rotation layer ref"
  )

  replaceOnce(
    `  const [markerHost, setMarkerHost] = useState<HTMLElement | null>(null)`,
    `  const [markerHost, setMarkerHost] = useState<HTMLElement | null>(null)
  const [mapRotationDeg, setMapRotationDeg] = useState(0)
  const mapRotationRef = useRef(0)
  const touchPointersRef = useRef<Map<number, PointerPosition>>(new Map())
  const touchRotationStartRef = useRef<{ angle: number; rotation: number } | null>(null)`,
    "insert rotation state"
  )

  replaceOnce(
    `  const [status, setStatus] = useState<Status>(API_KEY ? "loading" : "error")

  useEffect(() => {`,
    `  const [status, setStatus] = useState<Status>(API_KEY ? "loading" : "error")

  useEffect(() => {
    mapRotationRef.current = mapRotationDeg
  }, [mapRotationDeg])

  useEffect(() => {
    const el = rotationLayerRef.current
    if (!el) return

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return

      event.preventDefault()
      event.stopPropagation()

      const direction = event.deltaY > 0 ? 1 : -1
      const step = event.shiftKey ? ROTATION_WHEEL_SNAP_DEG : ROTATION_WHEEL_STEP_DEG

      setMapRotationDeg((prev) => {
        const next = normalizeRotation(prev + direction * step)
        mapRotationRef.current = next
        return next
      })
    }

    const options: AddEventListenerOptions = { passive: false, capture: true }
    el.addEventListener("wheel", handleWheel, options)

    return () => {
      el.removeEventListener("wheel", handleWheel, options)
    }
  }, [])

  function handleRotationPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return

    touchPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    const angle = angleBetweenPointers(touchPointersRef.current)
    if (angle != null) {
      touchRotationStartRef.current = {
        angle,
        rotation: mapRotationRef.current,
      }
    }
  }

  function handleRotationPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return
    if (!touchPointersRef.current.has(event.pointerId)) return

    touchPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    const start = touchRotationStartRef.current
    const angle = angleBetweenPointers(touchPointersRef.current)

    if (!start || angle == null) return

    const next = normalizeRotation(start.rotation + angle - start.angle)
    mapRotationRef.current = next
    setMapRotationDeg(next)
  }

  function handleRotationPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return

    touchPointersRef.current.delete(event.pointerId)

    const angle = angleBetweenPointers(touchPointersRef.current)
    if (angle == null) {
      touchRotationStartRef.current = null
      return
    }

    touchRotationStartRef.current = {
      angle,
      rotation: mapRotationRef.current,
    }
  }

  useEffect(() => {`,
    "insert wheel and touch rotation handlers"
  )
}

if (!content.includes("const rotationScale = rotationCoverScale(mapRotationDeg)")) {
  replaceOnce(
    `  const CROP = 52
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit" }}>
      <div ref={wrapperRef} className="absolute" style={{ inset: \`-\${CROP}px\` }}>
        <div ref={containerRef} className={cn("absolute inset-0", theme === "dark" && status === "ready" && "map-dark-filter")} aria-label="Route map" />
      </div>`,
    `  const CROP = 52
  const rotationScale = rotationCoverScale(mapRotationDeg)

  return (
    <div
      ref={rotationLayerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ borderRadius: "inherit", touchAction: "none" }}
      onPointerDown={handleRotationPointerDown}
      onPointerMove={handleRotationPointerMove}
      onPointerUp={handleRotationPointerUp}
      onPointerCancel={handleRotationPointerUp}
      onPointerLeave={handleRotationPointerUp}
    >
      <div
        ref={wrapperRef}
        className="absolute origin-center will-change-transform"
        style={{
          inset: \`-\${CROP}px\`,
          transform: \`rotate(\${mapRotationDeg}deg) scale(\${rotationScale})\`,
          transformOrigin: "center center",
        }}
      >
        <div ref={containerRef} className={cn("absolute inset-0", theme === "dark" && status === "ready" && "map-dark-filter")} aria-label="Route map" />
      </div>`,
    "apply rotated map wrapper"
  )
}

fs.writeFileSync(file, content, "utf8")
console.log("Map zoom + wheel/touch rotation enabled")
