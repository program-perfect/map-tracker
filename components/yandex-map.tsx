"use client"

import { BeaconMarker } from "@/components/beacon-marker"
import { useStore } from "@/lib/store"
import type { LatLng } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

const API_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
const ROUTE_COLOR = "#ef4444"
const MAX_ROUTE_WAYPOINTS = 12
const STARTUP_ROUTE_DELAY_MS = 900

declare global { interface Window { ymaps?: any } }

let scriptPromise: Promise<void> | null = null

function loadYmaps21(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject("ssr")
  if (window.ymaps?.ready) return new Promise<void>((res) => window.ymaps.ready(res))
  if (!API_KEY) return Promise.reject("no-key")
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-yandex-maps-api='2.1']")
    if (existing) {
      existing.addEventListener("load", () => window.ymaps.ready(resolve), { once: true })
      existing.addEventListener("error", () => { scriptPromise = null; reject("load-error") }, { once: true })
      return
    }
    const script = document.createElement("script")
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${API_KEY}&lang=ru_RU`
    script.async = true
    script.dataset.yandexMapsApi = "2.1"
    script.onload = () => window.ymaps.ready(resolve)
    script.onerror = () => { scriptPromise = null; reject("load-error") }
    document.head.appendChild(script)
  })
  return scriptPromise
}

type Status = "loading" | "ready" | "error"

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
}

function collectCoordinates(value: any, out: LatLng[]) {
  if (!Array.isArray(value)) return
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    out.push([value[0], value[1]])
    return
  }
  for (const item of value) collectCoordinates(item, out)
}

function readGeometryCoordinates(target: any, out: LatLng[]) {
  try { collectCoordinates(target?.geometry?.getCoordinates?.(), out) } catch {}
}

function getRouteCoordinates(route: any): LatLng[] {
  const coords: LatLng[] = []
  readGeometryCoordinates(route, coords)
  try {
    route.getPaths?.().each((path: any) => {
      readGeometryCoordinates(path, coords)
      try { path.getSegments?.().each((segment: any) => readGeometryCoordinates(segment, coords)) } catch {}
    })
  } catch {}

  const cleaned: LatLng[] = []
  for (const point of coords) {
    const prev = cleaned[cleaned.length - 1]
    if (!prev || Math.abs(prev[0] - point[0]) > 0.000001 || Math.abs(prev[1] - point[1]) > 0.000001) cleaned.push(point)
  }
  return cleaned
}

function pushLeg(result: LatLng[], from: LatLng, to: LatLng) {
  if (result.length === 0) result.push(from)
  const last = result[result.length - 1]
  if (Math.abs(last[0] - from[0]) > 0.000001 || Math.abs(last[1] - from[1]) > 0.000001) result.push(from)
  result.push(to)
}

function buildFallbackRoute(points: LatLng[]): LatLng[] {
  const result: LatLng[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    pushLeg(result, points[i], points[i + 1])
  }
  return result
}

function limitWaypoints(points: LatLng[], maxPoints = MAX_ROUTE_WAYPOINTS): LatLng[] {
  if (points.length <= maxPoints) return points
  const result: LatLng[] = []
  const last = points.length - 1

  for (let i = 0; i < maxPoints; i += 1) {
    result.push(points[Math.round((i / (maxPoints - 1)) * last)])
  }

  return result
}

async function buildRoadRoute(ymaps: any, points: LatLng[]): Promise<LatLng[]> {
  // The previous implementation requested every road leg separately. On the
  // current trace this produced dozens of route requests on page load. Try one
  // multi-point request first and fall back to the lightweight straight polyline
  // when the routing service is denied, slow, or unavailable.
  try {
    const route = await ymaps.route(limitWaypoints(points), {
      routingMode: "auto",
      mapStateAutoApply: false,
    })
    const coords = getRouteCoordinates(route)
    if (coords.length >= 2) return coords
  } catch {}

  return buildFallbackRoute(points)
}

export function YandexMap() {
  const {
    layers,
    zoom,
    setZoom,
    position,
    settings,
    centerRequest,
    placeBeacon,
    theme,
    routePoints,
    routeStatus,
    setRoutePathFromMap,
    setRouteBuildState,
    routeEditorActive,
    routeEditorPoints,
    addRouteEditorPoint,
  } = useStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const rotationLayerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const placemarkRef = useRef<any>(null)
  const trafficRef = useRef<any>(null)
  const routeLineRef = useRef<any>(null)
  const destinationRef = useRef<any>(null)
  const routeEditorObjectsRef = useRef<any[]>([])
  const nativeContextMenuCleanupRef = useRef<(() => void) | null>(null)
  const lastRouteEditorPointAtRef = useRef(0)
  const [markerHost, setMarkerHost] = useState<HTMLElement | null>(null)
  const [mapRotationDeg, setMapRotationDeg] = useState(0)
  const mapRotationRef = useRef(0)
  const touchPointersRef = useRef<Map<number, PointerPosition>>(new Map())
  const touchRotationStartRef = useRef<{ angle: number; rotation: number } | null>(null)

  const placeBeaconRef = useRef(placeBeacon)
  placeBeaconRef.current = placeBeacon
  const setZoomRef = useRef(setZoom)
  setZoomRef.current = setZoom
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const setRoutePathFromMapRef = useRef(setRoutePathFromMap)
  setRoutePathFromMapRef.current = setRoutePathFromMap
  const setRouteBuildStateRef = useRef(setRouteBuildState)
  setRouteBuildStateRef.current = setRouteBuildState
  const routeEditorActiveRef = useRef(routeEditorActive)
  routeEditorActiveRef.current = routeEditorActive
  const addRouteEditorPointRef = useRef(addRouteEditorPoint)
  addRouteEditorPointRef.current = addRouteEditorPoint

  const [status, setStatus] = useState<Status>(API_KEY ? "loading" : "error")

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

  useEffect(() => {
    if (!API_KEY) return
    let cancelled = false
    loadYmaps21()
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return
        const ymaps = window.ymaps
        const map = new ymaps.Map(containerRef.current, { center: [position[0], position[1]], zoom, controls: [] }, { suppressMapOpenBlock: true, copyrightUseMapMargin: false })
        mapRef.current = map
        try { map.copyrights.togglePromo(false) } catch {}
        try { map.behaviors.enable(["drag", "scrollZoom", "dblClickZoom", "multiTouch"]) } catch {}
        try { map.behaviors.disable(["rightMouseButtonMagnifier"]) } catch {}
        try { map.options.set("avoidFractionalZoom", true) } catch {}
        map.events.add("boundschange", () => {
          if (cancelled) return
          const z = Math.round(map.getZoom())
          if (z !== zoomRef.current) setZoomRef.current(z)
        })
        const addEditorPointSafely = (point: LatLng) => {
          const now = Date.now()
          if (now - lastRouteEditorPointAtRef.current < 120) return

          lastRouteEditorPointAtRef.current = now
          addRouteEditorPointRef.current(point)
        }

        const readMapEventPoint = (e: any): LatLng | null => {
          try {
            const coords: [number, number] | undefined = e.get("coords")
            if (!coords || typeof coords[0] !== "number" || typeof coords[1] !== "number") return null
            return [coords[0], coords[1]]
          } catch {
            return null
          }
        }

        const handleEditorMapPoint = (e: any) => {
          if (cancelled || !routeEditorActiveRef.current) return

          try { e.preventDefault?.() } catch {}
          try { e.stopPropagation?.() } catch {}

          const point = readMapEventPoint(e)
          if (!point) return

          addEditorPointSafely(point)
        }

        map.events.add("click", (e: any) => {
          if (cancelled) return
          const point = readMapEventPoint(e)
          if (!point) return

          if (routeEditorActiveRef.current) {
            addEditorPointSafely(point)
            return
          }

          placeBeaconRef.current(point)
        })

        map.events.add("contextmenu", handleEditorMapPoint)
        map.events.add("rightclick", handleEditorMapPoint)

        const nativeContextTarget = rotationLayerRef.current ?? containerRef.current
        const handleNativeContextMenu = (event: MouseEvent) => {
          if (!routeEditorActiveRef.current) return

          event.preventDefault()
          event.stopPropagation()

          const currentMap = mapRef.current
          if (!currentMap) return

          try {
            const projection = currentMap.options.get("projection")
            const globalPixels = currentMap.converter.pageToGlobal([event.pageX, event.pageY])
            const coords = projection.fromGlobalPixels(globalPixels, currentMap.getZoom())

            if (Array.isArray(coords) && typeof coords[0] === "number" && typeof coords[1] === "number") {
              addEditorPointSafely([coords[0], coords[1]])
            }
          } catch {}
        }

        nativeContextTarget?.addEventListener("contextmenu", handleNativeContextMenu, { capture: true })
        nativeContextMenuCleanupRef.current = () => {
          nativeContextTarget?.removeEventListener("contextmenu", handleNativeContextMenu, { capture: true } as AddEventListenerOptions)
        }
        const Layout = ymaps.templateLayoutFactory.createClass('<div id="beacon-layout-host" style="position:relative;width:0;height:0;overflow:visible;"></div>', {
          build() {
            Layout.superclass.build.call(this)
            const el = this.getParentElement().querySelector("#beacon-layout-host")
            if (el && !cancelled) setMarkerHost(el as HTMLElement)
          },
          clear() {
            setMarkerHost(null)
            Layout.superclass.clear.call(this)
          },
        })
        const placemark = new ymaps.Placemark([position[0], position[1]], {}, { iconLayout: Layout, iconShape: { type: "Circle", coordinates: [0, 0], radius: 14 } })
        placemarkRef.current = placemark
        map.geoObjects.add(placemark)
        if (!cancelled) setStatus("ready")
      })
      .catch(() => { if (!cancelled) setStatus("error") })
    return () => {
      cancelled = true
      nativeContextMenuCleanupRef.current?.()
      nativeContextMenuCleanupRef.current = null

      if (mapRef.current) {
        try { mapRef.current.destroy() } catch {}
        mapRef.current = null
        placemarkRef.current = null
        trafficRef.current = null
        routeLineRef.current = null
        destinationRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const ymaps = window.ymaps
    if (!map || !ymaps || status !== "ready") return
    if (layers.traffic) {
      if (!trafficRef.current) {
        trafficRef.current = new ymaps.control.TrafficControl({ shown: true })
        map.controls.add(trafficRef.current)
        trafficRef.current.showTraffic()
      }
    } else if (trafficRef.current) {
      try { trafficRef.current.hideTraffic(); map.controls.remove(trafficRef.current) } catch {}
      trafficRef.current = null
    }
  }, [layers.traffic, status])

  useEffect(() => {
    const id = "ymaps-labels-override"
    let el = document.getElementById(id) as HTMLStyleElement | null
    if (!layers.labels) {
      if (!el) {
        el = document.createElement("style")
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = `[class*="ymaps"][class*="places-pane"],[class*="ymaps"][class*="places-pane"] *,[class*="ymaps"][class*="labels"],[class*="ymaps"][class*="labels"] *{opacity:0!important;pointer-events:none!important;}`
    } else {
      el?.remove()
    }
    return () => { if (layers.labels) document.getElementById("ymaps-labels-override")?.remove() }
  }, [layers.labels])

  useEffect(() => {
    const map = mapRef.current
    const ymaps = window.ymaps
    if (!map || !ymaps || status !== "ready") return

    const clearRoute = () => {
      if (routeLineRef.current) {
        try { map.geoObjects.remove(routeLineRef.current) } catch {}
        routeLineRef.current = null
      }

      if (destinationRef.current) {
        try { map.geoObjects.remove(destinationRef.current) } catch {}
        destinationRef.current = null
      }
    }

    clearRoute()

    if (!settings.routeMode) {
      setRouteBuildStateRef.current("idle")
      return clearRoute
    }

    if (routePoints.length < 2) {
      setRouteBuildStateRef.current("error", "Need at least two route points")
      return clearRoute
    }

    try {
      setRouteBuildStateRef.current("building")

      const line = new ymaps.Polyline(
        routePoints,
        { hintContent: "Маршрут" },
        {
          strokeColor: ROUTE_COLOR,
          strokeOpacity: 0.96,
          strokeWidth: 4,
          strokeStyle: "solid",
        }
      )

      routeLineRef.current = line
      map.geoObjects.add(line)

      const destination = routePoints[routePoints.length - 1]
      const finish = new ymaps.Circle(
        [destination, 32],
        { hintContent: "Финиш маршрута" },
        {
          fillColor: ROUTE_COLOR,
          fillOpacity: 0.32,
          strokeColor: ROUTE_COLOR,
          strokeWidth: 2,
          strokeOpacity: 0.92,
        }
      )

      destinationRef.current = finish
      map.geoObjects.add(finish)

      setRoutePathFromMapRef.current(routePoints)
      setRouteBuildStateRef.current("ready", null)

      try {
        const bounds = line.geometry.getBounds?.()
        if (bounds) {
          map.setBounds(bounds, {
            checkZoomRange: true,
            zoomMargin: 64,
            duration: 0,
          })
        }
      } catch {}
    } catch {
      setRouteBuildStateRef.current("error", "Route render failed")
    }

    return clearRoute
  }, [routePoints, settings.routeMode, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (Math.round(map.getZoom()) !== zoom) map.setZoom(zoom, { duration: 200 })
  }, [zoom])

  useEffect(() => {
    const map = mapRef.current
    const ymaps = window.ymaps
    if (!map || !ymaps || status !== "ready") return

    const clearEditorObjects = () => {
      for (const object of routeEditorObjectsRef.current) {
        try {
          map.geoObjects.remove(object)
        } catch {}
      }
      routeEditorObjectsRef.current = []
    }

    clearEditorObjects()

    if (!routeEditorActive) return clearEditorObjects

    const objects: any[] = []

    if (routeEditorPoints.length >= 2) {
      const line = new ymaps.Polyline(
        routeEditorPoints,
        { hintContent: "Редактор маршрута" },
        {
          strokeColor: "#a855f7",
          strokeOpacity: 0.9,
          strokeWidth: 4,
          strokeStyle: "shortdash",
        }
      )
      objects.push(line)
      map.geoObjects.add(line)
    }

    routeEditorPoints.forEach((point, index) => {
      const isStart = index === 0
      const isFinish = index === routeEditorPoints.length - 1 && index > 0
      const color = isStart ? "#a855f7" : isFinish ? ROUTE_COLOR : "#2563eb"

      const circle = new ymaps.Circle(
        [point, isStart || isFinish ? 34 : 24],
        {
          hintContent: isStart
            ? "Старт маршрута"
            : isFinish
              ? "Финиш маршрута"
              : `Точка маршрута ${index + 1}`,
        },
        {
          fillColor: color,
          fillOpacity: 0.38,
          strokeColor: color,
          strokeWidth: 2,
          strokeOpacity: 0.95,
        }
      )

      objects.push(circle)
      map.geoObjects.add(circle)
    })

    routeEditorObjectsRef.current = objects

    return clearEditorObjects
  }, [routeEditorActive, routeEditorPoints, status])


  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== "ready") return
    const fit = () => { try { map.container.fitToViewport() } catch {} }
    window.addEventListener("resize", fit)
    document.addEventListener("fullscreenchange", fit)
    const timeoutId = window.setTimeout(fit, 250)
    return () => {
      window.removeEventListener("resize", fit)
      document.removeEventListener("fullscreenchange", fit)
      window.clearTimeout(timeoutId)
    }
  }, [status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !centerRequest) return
    map.setCenter([centerRequest.position[0], centerRequest.position[1]], zoom, { duration: 400 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerRequest])

  useEffect(() => {
    if (placemarkRef.current) {
      try { placemarkRef.current.geometry.setCoordinates([position[0], position[1]]) } catch {}
    }
  }, [position])

  const CROP = 52
  const rotationScale = rotationCoverScale(mapRotationDeg)

  return (
    <div
      ref={rotationLayerRef}
      className={cn("absolute inset-0 overflow-hidden", routeEditorActive && "cursor-crosshair")}
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
          inset: `-${CROP}px`,
          transform: `rotate(${mapRotationDeg}deg) scale(${rotationScale})`,
          transformOrigin: "center center",
        }}
      >
        <div ref={containerRef} className={cn("absolute inset-0", theme === "dark" && status === "ready" && "map-dark-filter")} aria-label="Route map" />
      </div>

      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-background">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm">Loading map...</span>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80 text-sm text-muted-foreground">
          <span>Map unavailable</span>
          <span className="text-xs opacity-70">Check Yandex Maps API key</span>
        </div>
      )}

      {status === "ready" && settings.routeMode && routeStatus === "building" && (
        <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-card/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow backdrop-blur">
          Building route...
        </div>
      )}

      {markerHost && settings.visible && status === "ready" && createPortal(<BeaconMarker centered />, markerHost)}
    </div>
  )
}
