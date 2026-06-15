"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useStore } from "@/lib/store"
import { BeaconMarker } from "@/components/beacon-marker"
import { cn } from "@/lib/utils"
import type { LatLng } from "@/lib/types"

const API_KEY =
  process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_YANDEX_MAPS_V3_API_KEY ||
  process.env.NEXT_PUBLIC_YMAPS_API_KEY ||
  ""
const API_KEY_ENV_NAMES = [
  "NEXT_PUBLIC_YANDEX_MAPS_API_KEY",
  "NEXT_PUBLIC_YANDEX_MAPS_V3_API_KEY",
  "NEXT_PUBLIC_YMAPS_API_KEY",
]
const YMAPS3_SCRIPT_ID = "yandex-maps-v3-script"
const YMAPS3_SCRIPT_URL = API_KEY
  ? `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(API_KEY)}&lang=ru_RU`
  : null

const YMAPS3_KEY_HINT =
  "Проверь ключ в Кабинете разработчика Яндекса: сервис должен быть JavaScript API, а в ограничениях HTTP Referer должен быть добавлен текущий origin."

declare global {
  interface Window {
    ymaps3?: any
  }
}

type LngLat = [number, number]
type Status = "loading" | "ready" | "error"

let scriptPromise: Promise<any> | null = null

function toYMapCoordinates(position: LatLng): LngLat {
  return [position[1], position[0]]
}

function fromYMapCoordinates(coordinates: LngLat): LatLng {
  return [coordinates[1], coordinates[0]]
}

function isLngLat(value: unknown): value is LngLat {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  )
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null
}

function readNestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return getRecord(record[key])
}

function extractCoordinates(args: unknown[]): LngLat | null {
  for (const arg of args) {
    const record = getRecord(arg)
    if (!record) continue

    if (isLngLat(record.coordinates)) return record.coordinates
    if (isLngLat(record.lngLat)) return record.lngLat

    const location = readNestedRecord(record, "location")
    if (location && isLngLat(location.center)) return location.center
    if (location && isLngLat(location.coordinates)) return location.coordinates

    const map = readNestedRecord(record, "map")
    if (map && isLngLat(map.coordinates)) return map.coordinates
  }

  return null
}

function extractZoom(event: unknown, map: any): number | null {
  const record = getRecord(event)
  const location = record ? readNestedRecord(record, "location") : null

  const zoomFromEvent = location?.zoom ?? record?.zoom
  if (typeof zoomFromEvent === "number" && Number.isFinite(zoomFromEvent)) {
    return zoomFromEvent
  }

  const zoomFromMap = map?.zoom
  if (typeof zoomFromMap === "number" && Number.isFinite(zoomFromMap)) {
    return zoomFromMap
  }

  return null
}

function createYmaps3Error(message: string, cause?: unknown) {
  const error = new Error(message) as Error & { cause?: unknown }
  if (cause !== undefined) error.cause = cause
  return error
}

function getUserFacingError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Неизвестная ошибка загрузки Яндекс Карт v3"
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

  if (typeof Event !== "undefined" && error instanceof Event) {
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
    origin: window.location.origin,
    userAgent: window.navigator.userAgent,
    expectedEnvNames: API_KEY_ENV_NAMES,
    apiKeyPresent: Boolean(API_KEY),
    apiKeyLength: API_KEY.length,
    scriptId: YMAPS3_SCRIPT_ID,
    scriptSrc: script?.src ? redactApiKey(script.src) : YMAPS3_SCRIPT_URL ? redactApiKey(YMAPS3_SCRIPT_URL) : null,
    scriptInDom: Boolean(script),
    scriptLoadFailed: script?.dataset.ymaps3Error ?? null,
    scriptReadyState: script?.dataset.ymaps3Ready ?? null,
    ymaps3Exists: Boolean(window.ymaps3),
    ymaps3ReadyExists: Boolean(window.ymaps3?.ready),
    expectedRefererOrigin: window.location.origin,
    keyHint: YMAPS3_KEY_HINT,
    errorDetails: getErrorDetails(error),
  }

  console.groupCollapsed("[Yandex Maps v3] Failed to load map")
  console.error("Full error object:", error)
  console.error("Full diagnostics:", diagnostics)
  console.groupEnd()
}

async function waitForReady(script?: HTMLScriptElement | null) {
  if (!window.ymaps3?.ready) {
    throw createYmaps3Error("Yandex Maps v3 script loaded, but window.ymaps3.ready is missing")
  }

  await window.ymaps3.ready
  script?.setAttribute("data-ymaps3-ready", "true")
  return window.ymaps3
}

function waitForExistingScript(script: HTMLScriptElement) {
  return new Promise<any>((resolve, reject) => {
    if (window.ymaps3?.ready) {
      waitForReady(script).then(resolve).catch(reject)
      return
    }

    const onLoad = () => {
      cleanup()
      waitForReady(script).then(resolve).catch(reject)
    }
    const onError = (event: Event) => {
      cleanup()
      script.dataset.ymaps3Error = "true"
      reject(createYmaps3Error(`Yandex Maps v3 script failed to load. ${YMAPS3_KEY_HINT}`, event))
    }
    const cleanup = () => {
      script.removeEventListener("load", onLoad)
      script.removeEventListener("error", onError)
    }

    script.addEventListener("load", onLoad, { once: true })
    script.addEventListener("error", onError, { once: true })

    window.setTimeout(() => {
      if (window.ymaps3?.ready) {
        cleanup()
        waitForReady(script).then(resolve).catch(reject)
      }
    }, 0)
  })
}

function loadYmaps3(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(createYmaps3Error("Yandex Maps v3 cannot be loaded during SSR"))
  }
  if (!API_KEY || !YMAPS3_SCRIPT_URL) {
    return Promise.reject(
      createYmaps3Error(`Yandex Maps v3 API key is missing. Set one of: ${API_KEY_ENV_NAMES.join(", ")}`),
    )
  }
  if (window.ymaps3?.ready) return waitForReady()
  if (scriptPromise) return scriptPromise

  const existingScript = document.getElementById(YMAPS3_SCRIPT_ID) as HTMLScriptElement | null
  if (existingScript) {
    if (existingScript.dataset.ymaps3Error === "true") existingScript.remove()
    else {
      scriptPromise = waitForExistingScript(existingScript).catch((error: unknown) => {
        scriptPromise = null
        throw error
      })
      return scriptPromise
    }
  }

  scriptPromise = new Promise<any>((resolve, reject) => {
    const script = document.createElement("script")
    script.id = YMAPS3_SCRIPT_ID
    script.src = YMAPS3_SCRIPT_URL
    script.async = true
    script.dataset.ymaps3Ready = "false"

    script.onload = () => {
      waitForReady(script).then(resolve).catch((error: unknown) => {
        scriptPromise = null
        reject(createYmaps3Error("Yandex Maps v3 ready promise rejected", error))
      })
    }
    script.onerror = (event) => {
      script.dataset.ymaps3Error = "true"
      scriptPromise = null
      reject(createYmaps3Error(`Yandex Maps v3 script failed to load. ${YMAPS3_KEY_HINT}`, event))
    }
    document.head.appendChild(script)
  })

  return scriptPromise
}

function assertYmaps3Core(ymaps3: any) {
  const required = [
    "YMap",
    "YMapDefaultSchemeLayer",
    "YMapDefaultFeaturesLayer",
    "YMapMarker",
    "YMapListener",
  ]
  const missing = required.filter((name) => typeof ymaps3?.[name] !== "function")

  if (missing.length > 0) {
    throw createYmaps3Error(`Yandex Maps v3 core is incomplete. Missing: ${missing.join(", ")}`)
  }
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
  const positionRef = useRef(position)
  positionRef.current = position

  const initialError = API_KEY ? null : `Нет ключа. Добавь ${API_KEY_ENV_NAMES[0]} в .env.local и перезапусти dev-сервер.`
  const [status, setStatus] = useState<Status>(API_KEY ? "loading" : "error")
  const [loadError, setLoadError] = useState<string | null>(initialError)
  const [origin, setOrigin] = useState<string>("")

  const errorHint = useMemo(() => {
    if (!loadError) return null
    if (!API_KEY) return loadError
    return `${loadError} Текущий HTTP Referer / origin: ${origin || "не определён"}.`
  }, [loadError, origin])

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    if (!API_KEY) {
      const error = createYmaps3Error(`Yandex Maps v3 API key is missing. Set one of: ${API_KEY_ENV_NAMES.join(", ")}`)
      logYmaps3LoadError(error, { stage: "configuration" })
      setLoadError(getUserFacingError(error))
      return
    }

    let cancelled = false

    loadYmaps3()
      .then((ymaps3) => {
        if (cancelled || !containerRef.current || mapRef.current) return

        try {
          assertYmaps3Core(ymaps3)

          const {
            YMap,
            YMapDefaultSchemeLayer,
            YMapDefaultFeaturesLayer,
            YMapMarker,
            YMapListener,
          } = ymaps3

          const markerHostElement = document.createElement("div")
          markerHostElement.style.cssText = "position:relative;width:0;height:0;overflow:visible;"

          const marker = new YMapMarker(
            { coordinates: toYMapCoordinates(positionRef.current), zIndex: 1000 },
            markerHostElement,
          )

          const listener = new YMapListener({
            layerId: "any",
            onClick: (...args: unknown[]) => {
              if (cancelled) return
              const nextCoordinates = extractCoordinates(args)
              if (!nextCoordinates) return
              placeBeaconRef.current(fromYMapCoordinates(nextCoordinates))
            },
            onUpdate: (event: unknown) => {
              if (cancelled) return
              const nextZoom = extractZoom(event, mapRef.current)
              if (typeof nextZoom !== "number") return

              const roundedZoom = Math.round(nextZoom)
              if (roundedZoom !== zoomRef.current) {
                setZoomRef.current(roundedZoom)
              }
            },
          })

          const schemeLayer = new YMapDefaultSchemeLayer({})
          const featuresLayer = new YMapDefaultFeaturesLayer({})

          const map = new YMap(
            containerRef.current,
            {
              location: {
                center: toYMapCoordinates(positionRef.current),
                zoom: zoomRef.current,
              },
              behaviors: ["drag", "scrollZoom", "dblClick", "pinchZoom"],
              mode: "auto",
            },
            [schemeLayer, featuresLayer, marker, listener],
          )

          mapRef.current = map
          markerRef.current = marker
          schemeLayerRef.current = schemeLayer
          featuresLayerRef.current = featuresLayer
          listenerRef.current = listener
          setMarkerHost(markerHostElement)
          setLoadError(null)
          if (!cancelled) setStatus("ready")
        } catch (error) {
          throw createYmaps3Error("Yandex Maps v3 map initialization failed", error)
        }
      })
      .catch((error: unknown) => {
        logYmaps3LoadError(error, { stage: "map-load-or-init" })
        if (!cancelled) {
          setLoadError(getUserFacingError(error))
          setStatus("error")
        }
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
          zoom,
          duration: 200,
        },
      })
    } catch (error) {
      console.warn("[Yandex Maps v3] Failed to sync zoom", error)
    }
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
    } catch (error) {
      console.warn("[Yandex Maps v3] Failed to handle center request", error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerRequest, status])

  // ── Sync marker coordinate when position changes ───────────────────────────
  useEffect(() => {
    const marker = markerRef.current
    if (!marker || status !== "ready") return

    try {
      marker.update({ coordinates: toYMapCoordinates(position) })
    } catch (error) {
      console.warn("[Yandex Maps v3] Failed to sync marker coordinates", error)
    }
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/90 px-6 text-center text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Карта недоступна</span>
          <span className="max-w-md text-xs opacity-80">
            {errorHint ?? "Ошибка загрузки Яндекс Карт v3. Подробности выведены в консоль."}
          </span>
          {origin && (
            <code className="max-w-md break-all rounded bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
              HTTP Referer / origin: {origin}
            </code>
          )}
        </div>
      )}

      {/* Beacon marker — portalled into Yandex's own v3 marker DOM node so
          the library handles geo→pixel positioning with no manual math. */}
      {markerHost && settings.visible && status === "ready" &&
        createPortal(<BeaconMarker centered />, markerHost)}
    </div>
  )
}
