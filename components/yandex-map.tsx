"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useStore } from "@/lib/store"
import { BeaconMarker } from "@/components/beacon-marker"
import { cn } from "@/lib/utils"
import type { LatLng } from "@/lib/types"

const API_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
const YMAPS3_SCRIPT_ID = "yandex-maps-v3-script"
const YMAPS3_SCRIPT_URL = API_KEY
  ? `https://api-maps.yandex.ru/v3/?apikey=${API_KEY}&lang=ru_RU`
  : null

declare global {
  interface Window {
    ymaps3?: any
  }
}

let scriptPromise: Promise<any> | null = null

function toYMapCoordinates(position: LatLng): [number, number] {
  return [position[1], position[0]]
}

function fromYMapCoordinates(coordinates: [number, number]): LatLng {
  return [coordinates[1], coordinates[0]]
}

function createYmaps3Error(message: string, cause?: unknown) {
  const error = new Error(message) as Error & { cause?: unknown }
  if (cause !== undefined) error.cause = cause
  return error
}

function redactApiKey(url: string) {
  return url.replace(/([?&]apikey=)[^&]*/i, "$1<redacted>")
}

function getErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const errorWithCause = error as Error & { cause?: unknown }
    return {
      type: "Error",
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: errorWithCause.cause,
    }
  }

  if (error instanceof Event) {
    const target = error.target
    const currentTarget = error.currentTarget

    return {
      type: "Event",
      eventType: error.type,
      isTrusted: error.isTrusted,
      targetTagName: target instanceof HTMLElement ? target.tagName : undefined,
      targetSrc: target instanceof HTMLScriptElement ? redactApiKey(target.src) : undefined,
      currentTargetTagName: currentTarget instanceof HTMLElement ? currentTarget.tagName : undefined,
      currentTargetSrc: currentTarget instanceof HTMLScriptElement ? redactApiKey(currentTarget.src) : undefined,
    }
  }

  return {
    type: typeof error,
    value: error,
  }
}

function logYmaps3LoadError(error: unknown, context: Record<string, unknown>) {
  if (typeof window === "undefined") return

  const script = document.getElementById(YMAPS3_SCRIPT_ID) as HTMLScriptElement | null

  const diagnostics = {
    ...context,
    timestamp: new Date().toISOString(),
    currentUrl: window.location.href,
    userAgent: window.navigator.userAgent,
    apiKeyPresent: Boolean(API_KEY),
    apiKeyLength: API_KEY?.length ?? 0,
    scriptId: YMAPS3_SCRIPT_ID,
    scriptSrc: script?.src ? redactApiKey(script.src) : YMAPS3_SCRIPT_URL ? redactApiKey(YMAPS3_SCRIPT_URL) : null,
    scriptInDom: Boolean(script),
    ymaps3Exists: Boolean(window.ymaps3),
    ymaps3ReadyExists: Boolean(window.ymaps3?.ready),
    errorDetails: getErrorDetails(error),
  }

  console.groupCollapsed("[Yandex Maps v3] Failed to load map")
  console.error("Full error object:", error)
  console.error("Full diagnostics:", diagnostics)
  console.groupEnd()
}

function loadYmaps3(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(createYmaps3Error("Yandex Maps v3 cannot be loaded during SSR"))
  }
  if (window.ymaps3?.ready) return window.ymaps3.ready.then(() => window.ymaps3)
  if (!API_KEY || !YMAPS3_SCRIPT_URL) {
    return Promise.reject(createYmaps3Error("NEXT_PUBLIC_YANDEX_MAPS_API_KEY is not configured"))
  }
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<any>((resolve, reject) => {
    const script = document.createElement("script")
    script.id = YMAPS3_SCRIPT_ID
    script.src = YMAPS3_SCRIPT_URL
    script.async = true
    script.onload = () => {
      if (!window.ymaps3?.ready) {
        scriptPromise = null
        reject(createYmaps3Error("Yandex Maps v3 script loaded, but window.ymaps3.ready is missing"))
        return
      }

      window.ymaps3.ready
        .then(() => resolve(window.ymaps3))
        .catch((error: unknown) => {
          scriptPromise = null
          reject(createYmaps3Error("Yandex Maps v3 ready promise rejected", error))
        })
    }
    script.onerror = (event) => {
      scriptPromise = null
      reject(createYmaps3Error("Yandex Maps v3 script failed to load", event))
    }
    document.head.appendChild(script)
  })

  return scriptPromise
}

type Status = "loading" | "ready" | "error"

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
  } = useStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const schemeLayerRef = useRef<any>(null)
  const featuresLayerRef = useRef<any>(null)
  const listenerRef = useRef<any>(null)

  // DOM node that Yandex renders the custom marker into, so we can portal BeaconMarker there.
  const [markerHost, setMarkerHost] = useState<HTMLElement | null>(null)

  // Stable refs so API event handlers never capture stale React values.
  const placeBeaconRef = useRef(placeBeacon)
  placeBeaconRef.current = placeBeacon
  const setZoomRef = useRef(setZoom)
  setZoomRef.current = setZoom
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  const [status, setStatus] = useState<Status>(API_KEY ? "loading" : "error")

  useEffect(() => {
    if (!API_KEY) {
      logYmaps3LoadError(
        createYmaps3Error("NEXT_PUBLIC_YANDEX_MAPS_API_KEY is not configured"),
        { stage: "configuration" },
      )
      return
    }

    let cancelled = false

    loadYmaps3()
      .then((ymaps3) => {
        if (cancelled || !containerRef.current || mapRef.current) return

        const {
          YMap,
          YMapDefaultSchemeLayer,
          YMapDefaultFeaturesLayer,
          YMapMarker,
          YMapListener,
        } = ymaps3

        const map = new YMap(containerRef.current, {
          location: {
            center: toYMapCoordinates(position),
            zoom,
          },
          behaviors: ["drag", "scrollZoom", "dblClick", "pinchZoom"],
          mode: "vector",
        })
        mapRef.current = map

        const schemeLayer = new YMapDefaultSchemeLayer({})
        schemeLayerRef.current = schemeLayer
        map.addChild(schemeLayer)

        const featuresLayer = new YMapDefaultFeaturesLayer({})
        featuresLayerRef.current = featuresLayer
        map.addChild(featuresLayer)

        const markerHostElement = document.createElement("div")
        markerHostElement.style.cssText = "position:relative;width:0;height:0;overflow:visible;"
        setMarkerHost(markerHostElement)

        const marker = new YMapMarker(
          { coordinates: toYMapCoordinates(position) },
          markerHostElement,
        )
        markerRef.current = marker
        map.addChild(marker)

        const listener = new YMapListener({
          layer: "any",
          onClick: (_object: unknown, event: { coordinates?: [number, number] }) => {
            if (cancelled || !event.coordinates) return
            placeBeaconRef.current(fromYMapCoordinates(event.coordinates))
          },
          onUpdate: (event: { location?: { zoom?: number } }) => {
            if (cancelled) return
            const nextZoom = event.location?.zoom
            if (typeof nextZoom !== "number") return

            const roundedZoom = Math.round(nextZoom)
            if (roundedZoom !== zoomRef.current) {
              setZoomRef.current(roundedZoom)
            }
          },
        })
        listenerRef.current = listener
        map.addChild(listener)

        if (!cancelled) setStatus("ready")
      })
      .catch((error: unknown) => {
        logYmaps3LoadError(error, { stage: "initial-load" })
        if (!cancelled) setStatus("error")
      })

    return () => {
      cancelled = true
      setMarkerHost(null)
      if (mapRef.current) {
        try { mapRef.current.destroy() } catch {}
        mapRef.current = null
        markerRef.current = null
        schemeLayerRef.current = null
        featuresLayerRef.current = null
        listenerRef.current = null
        scriptPromise = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Traffic layer ──────────────────────────────────────────────────────────
  // Yandex Maps API v3 does not use the old ymaps.control.TrafficControl from 2.1.
  // Keep the layer flag wired as a no-op instead of crashing the map while the rest
  // of the app is migrated to the v3 entity/layer model.
  useEffect(() => {
    if (status !== "ready") return
  }, [layers.traffic, status])

  // ── Labels layer fallback ──────────────────────────────────────────────────
  // In API 2.1 labels were separate DOM panes, so CSS selectors could hide them.
  // API v3 renders the scheme as vector/canvas layers, so this CSS is only a safe
  // fallback for auxiliary DOM labels and will not mutate the map instance.
  useEffect(() => {
    const id = "ymaps-labels-override"
    let el = document.getElementById(id) as HTMLStyleElement | null

    if (!layers.labels) {
      if (!el) {
        el = document.createElement("style")
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = `
        [class*="ymaps"][class*="places-pane"],
        [class*="ymaps"][class*="places-pane"] *,
        [class*="ymaps"][class*="labels"],
        [class*="ymaps"][class*="labels"] * {
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `
    } else {
      el?.remove()
    }

    return () => {
      if (layers.labels) document.getElementById(id)?.remove()
    }
  }, [layers.labels])

  // ── Zoom sync from controls ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== "ready") return

    try {
      map.update({
        location: {
          center: toYMapCoordinates(position),
          zoom,
          duration: 200,
        },
      })
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, status])

  // ── Center request ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !centerRequest || status !== "ready") return

    try {
      map.update({
        location: {
          center: toYMapCoordinates(centerRequest.position),
          zoom,
          duration: 400,
        },
      })
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerRequest, status])

  // ── Sync marker coordinate when position changes ───────────────────────────
  useEffect(() => {
    const marker = markerRef.current
    if (!marker || status !== "ready") return

    try {
      marker.update({ coordinates: toYMapCoordinates(position) })
    } catch {}
  }, [position, status])

  // ── Let the v3 renderer recalculate after fullscreen/layout changes ────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== "ready") return

    const resize = () => {
      try { map.resize?.() } catch {}
    }

    window.addEventListener("resize", resize)
    document.addEventListener("fullscreenchange", resize)

    return () => {
      window.removeEventListener("resize", resize)
      document.removeEventListener("fullscreenchange", resize)
    }
  }, [status])

  // ── Render ─────────────────────────────────────────────────────────────────
  const CROP = 52

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ borderRadius: "inherit" }}
    >
      {/* negative margin exposes extra map area that gets clipped by overflow:hidden above */}
      <div
        className="absolute"
        style={{ inset: `-${CROP}px` }}
      >
        <div
          ref={containerRef}
          className={cn(
            "absolute inset-0",
            // Keep the existing app-level dark-map visual treatment and the
            // BeaconMarker counter-filter behavior unchanged after the v3 switch.
            theme === "dark" && status === "ready" && "map-dark-filter",
          )}
          aria-label="Карта Санкт-Петербурга"
        />
      </div>

      {/* Loading state */}
      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-background">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm">Загрузка карты…</span>
          </div>
        </div>
      )}

      {/* Error / no key */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80 text-sm text-muted-foreground">
          <span>Карта недоступна</span>
          <span className="text-xs opacity-70">Проверьте API-ключ Яндекс Карт v3</span>
        </div>
      )}

      {/* Beacon marker — portalled into Yandex's own v3 marker DOM node so
          the library handles geo→pixel positioning with no manual math. */}
      {markerHost && settings.visible && status === "ready" &&
        createPortal(<BeaconMarker centered />, markerHost)}
    </div>
  )
}
