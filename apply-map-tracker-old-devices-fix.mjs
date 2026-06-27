import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const changed = []
const skipped = []

function filePath(file) {
  return path.join(root, file)
}

function readFile(file) {
  return fs.readFileSync(filePath(file), 'utf8').replace(/\r\n/g, '\n')
}

function writeFile(file, content) {
  fs.writeFileSync(filePath(file), content, 'utf8')
}

function replaceOnce(content, search, replacement, file, label, marker = replacement) {
  if (content.includes(marker)) {
    skipped.push(`${file}: ${label} already applied`)
    return content
  }

  const index = content.indexOf(search)
  if (index === -1) {
    throw new Error(`${file}: cannot find block for ${label}`)
  }

  changed.push(`${file}: ${label}`)
  return content.slice(0, index) + replacement + content.slice(index + search.length)
}

function edit(file, fn) {
  const before = readFile(file)
  const after = fn(before)
  if (after !== before) writeFile(file, after)
}

edit('app/layout.tsx', (content) => {
  content = replaceOnce(
    content,
    "const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })",
    "const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'], display: 'swap' })",
    'app/layout.tsx',
    'font display swap for Geist Sans',
    "display: 'swap' })"
  )

  content = replaceOnce(
    content,
    "const geistMono = Geist_Mono({\n  variable: '--font-geist-mono',\n  subsets: ['latin'],\n})",
    "const geistMono = Geist_Mono({\n  variable: '--font-geist-mono',\n  subsets: ['latin'],\n  display: 'swap',\n})\n\nconst analyticsEnabled = process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === '1'",
    'app/layout.tsx',
    'font display swap for Geist Mono and analytics opt-in',
    'const analyticsEnabled ='
  )

  content = replaceOnce(
    content,
    "{process.env.NODE_ENV === 'production' && <Analytics />}",
    "{analyticsEnabled && <Analytics />}",
    'app/layout.tsx',
    'disable analytics unless NEXT_PUBLIC_ENABLE_ANALYTICS=1',
    '{analyticsEnabled && <Analytics />}'
  )

  return content
})

edit('components/app-shell.tsx', (content) => {
  content = replaceOnce(
    content,
    `const MOBILE_NAV_HEIGHT = 84
const FULLSCREEN_DRAG_THRESHOLD = 34

function usePrefersReducedMotion() {`,
    `const MOBILE_NAV_HEIGHT = 84
const FULLSCREEN_DRAG_THRESHOLD = 34

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState<boolean | null>(null)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()

    if (media.addEventListener) {
      media.addEventListener("change", update)
      return () => media.removeEventListener("change", update)
    }

    media.addListener(update)
    return () => media.removeListener(update)
  }, [query])

  return matches
}

function useLowEndDevice() {
  const [lowEnd, setLowEnd] = useState(false)

  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
    setLowEnd(Boolean((nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) || (nav.deviceMemory && nav.deviceMemory <= 4) || nav.connection?.saveData))
  }, [])

  return lowEnd
}

function usePrefersReducedMotion() {`,
    'components/app-shell.tsx',
    'viewport and low-end-device hooks',
    'function useMediaQuery(query: string)'
  )

  content = replaceOnce(
    content,
    `  const mapLeft = collapsed ? railWidth : railWidth + panelWidth
  const prefersReducedMotion = usePrefersReducedMotion()
  const mobileSheetTransition = prefersReducedMotion
    ? "transition-none"
    : "transition-[bottom,top,max-height,border-radius,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
  const mobileContentTransition = prefersReducedMotion
    ? "transition-none"
    : "transition-[height,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"`,
    `  const mapLeft = collapsed ? railWidth : railWidth + panelWidth
  const isDesktop = useMediaQuery("(min-width: 1024px)")
  const lowEndDevice = useLowEndDevice()
  const prefersReducedMotion = usePrefersReducedMotion()
  const preferSimpleUi = prefersReducedMotion || lowEndDevice
  const mobileSheetTransition = preferSimpleUi
    ? "transition-none"
    : "transition-[bottom,top,max-height,border-radius,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
  const mobileContentTransition = preferSimpleUi
    ? "transition-none"
    : "transition-[height,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"`,
    'components/app-shell.tsx',
    'simple UI detection',
    'const preferSimpleUi ='
  )

  content = replaceOnce(
    content,
    `  useEffect(() => {
    const delay = prefersReducedMotion ? 0 : 330
    const id = window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"))
    }, delay)
    return () => window.clearTimeout(id)
  }, [mobilePanelExpanded, prefersReducedMotion])`,
    `  useEffect(() => {
    const delay = preferSimpleUi ? 0 : 330
    const id = window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"))
    }, delay)
    return () => window.clearTimeout(id)
  }, [mobilePanelExpanded, preferSimpleUi])`,
    'components/app-shell.tsx',
    'avoid delayed resize on simple UI',
    '[mobilePanelExpanded, preferSimpleUi]'
  )

  content = replaceOnce(
    content,
    `      <div
        className="absolute bottom-0 right-0 top-0 hidden overflow-hidden rounded-l-[28px] bg-card/95 shadow-[0_24px_80px_-36px_rgb(0_0_0/0.28)] transition-[left,border-radius] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-background dark:shadow-[0_24px_80px_-36px_rgb(0_0_0/0.45)] lg:block"
        style={{ left: mapLeft }}
      >
        <YandexMap />
      </div>`,
    `      {isDesktop === true && (
        <div
          className={cn(
            "absolute bottom-0 right-0 top-0 hidden overflow-hidden rounded-l-[28px] bg-card/95 shadow-[0_24px_80px_-36px_rgb(0_0_0/0.28)] dark:bg-background dark:shadow-[0_24px_80px_-36px_rgb(0_0_0/0.45)] lg:block",
            preferSimpleUi ? "transition-none" : "transition-[left,border-radius] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          )}
          style={{ left: mapLeft }}
        >
          <YandexMap />
        </div>
      )}`,
    'components/app-shell.tsx',
    'mount only desktop map on desktop',
    'isDesktop === true'
  )

  content = replaceOnce(
    content,
    `      <div className="absolute inset-0 bg-background lg:hidden">
        <YandexMap />
      </div>`,
    `      {isDesktop === false && (
        <div className="absolute inset-0 bg-background lg:hidden">
          <YandexMap />
        </div>
      )}`,
    'components/app-shell.tsx',
    'mount only mobile map on mobile',
    'isDesktop === false'
  )

  content = replaceOnce(
    content,
    `            "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",`,
    `            preferSimpleUi ? "transition-none" : "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",`,
    'components/app-shell.tsx',
    'simplify panel width transition',
    'preferSimpleUi ? "transition-none" : "transition-[width]'
  )

  content = replaceOnce(
    content,
    `              "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",`,
    `              preferSimpleUi ? "transition-none" : "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",`,
    'components/app-shell.tsx',
    'simplify panel opacity transition',
    'preferSimpleUi ? "transition-none" : "transition-[transform,opacity]'
  )

  content = replaceOnce(
    content,
    `                  prefersReducedMotion ? "w-12" : "transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",`,
    `                  preferSimpleUi ? "w-12" : "transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",`,
    'components/app-shell.tsx',
    'simplify mobile handle transition',
    'preferSimpleUi ? "w-12"'
  )

  return content
})

edit('components/display-mode-manager.tsx', (content) => {
  content = replaceOnce(
    content,
    `    const tryEnterFullscreen = () => {
      void enterFullscreen()
    }

    void enterFullscreen()

    window.addEventListener("pointerdown", tryEnterFullscreen, { once: true })`,
    `    // Fullscreen is blocked by browsers unless it is started from a user gesture.
    // Do not call it immediately on mount: that creates console errors and extra work.
    const tryEnterFullscreen = () => {
      void enterFullscreen()
    }

    window.addEventListener("pointerdown", tryEnterFullscreen, { once: true })`,
    'components/display-mode-manager.tsx',
    'remove blocked fullscreen attempt on mount',
    'Do not call it immediately on mount'
  )
  return content
})

edit('components/yandex-map.tsx', (content) => {
  content = replaceOnce(
    content,
    `const API_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
const ROUTE_COLOR = "#ef4444"`,
    `const API_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
const ROUTE_COLOR = "#ef4444"
const MAX_ROUTE_WAYPOINTS = 12
const STARTUP_ROUTE_DELAY_MS = 900`,
    'components/yandex-map.tsx',
    'route optimization constants',
    'MAX_ROUTE_WAYPOINTS'
  )

  content = replaceOnce(
    content,
    `async function buildSegmentedRoadRoute(ymaps: any, points: LatLng[]): Promise<LatLng[]> {
  const result: LatLng[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i]
    const to = points[i + 1]
    try {
      const segmentRoute = await ymaps.route([from, to], { routingMode: "auto" })
      const segmentCoords = getRouteCoordinates(segmentRoute)
      if (segmentCoords.length >= 2) {
        result.push(...(result.length === 0 ? segmentCoords : segmentCoords.slice(1)))
        continue
      }
    } catch {}
    pushLeg(result, from, to)
  }
  return result
}`,
    `function buildFallbackRoute(points: LatLng[]): LatLng[] {
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
}`,
    'components/yandex-map.tsx',
    'replace segmented routing storm',
    'function buildFallbackRoute(points: LatLng[])'
  )

  content = replaceOnce(
    content,
    `        try { map.copyrights.togglePromo(false) } catch {}`,
    `        try { map.copyrights.togglePromo(false) } catch {}
        try { map.behaviors.disable(["scrollZoom", "rightMouseButtonMagnifier"]) } catch {}
        try { map.options.set("avoidFractionalZoom", true) } catch {}`,
    'components/yandex-map.tsx',
    'disable expensive map interactions',
    'avoidFractionalZoom'
  )

  content = content.replace(/\n        scriptPromise = null/g, '')

  const oldRouteEffect = `  useEffect(() => {
    const map = mapRef.current
    const ymaps = window.ymaps
    if (!map || !ymaps || status !== "ready") return

    const clearRoute = () => {
      if (routeLineRef.current) { try { map.geoObjects.remove(routeLineRef.current) } catch {}; routeLineRef.current = null }
      if (destinationRef.current) { try { map.geoObjects.remove(destinationRef.current) } catch {}; destinationRef.current = null }
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

    let cancelled = false
    setRouteBuildStateRef.current("building")
    buildSegmentedRoadRoute(ymaps, routePoints)
      .then((coords) => {
        if (cancelled) return
        if (coords.length < 2) {
          setRouteBuildStateRef.current("error", "No route geometry")
          return
        }
        const routeLine = new ymaps.Polyline(coords, { hintContent: "KZ SPB" }, { strokeColor: ROUTE_COLOR, strokeOpacity: 0.96, strokeWidth: 4, strokeStyle: "solid" })
        routeLineRef.current = routeLine
        map.geoObjects.add(routeLine)
        const destination = routePoints[routePoints.length - 1]
        const destinationMarker = new ymaps.Placemark(destination, { hintContent: "SPB" }, { preset: "islands#redDotIcon", iconColor: ROUTE_COLOR })
        destinationRef.current = destinationMarker
        map.geoObjects.add(destinationMarker)
        setRoutePathFromMapRef.current(coords)
        try {
          const bounds = routeLine.geometry.getBounds?.()
          if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 64, duration: 450 })
        } catch {}
      })
      .catch(() => {
        if (!cancelled) setRouteBuildStateRef.current("error", "No route geometry")
      })

    return () => { cancelled = true; clearRoute() }
  }, [routePoints, settings.routeMode, status])`

  const newRouteEffect = `  useEffect(() => {
    const map = mapRef.current
    const ymaps = window.ymaps
    if (!map || !ymaps || status !== "ready") return

    const clearRoute = () => {
      if (routeLineRef.current) { try { map.geoObjects.remove(routeLineRef.current) } catch {}; routeLineRef.current = null }
      if (destinationRef.current) { try { map.geoObjects.remove(destinationRef.current) } catch {}; destinationRef.current = null }
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

    let cancelled = false
    let routeTimer: number | null = null
    let idleCallbackId: number | null = null
    setRouteBuildStateRef.current("building")

    const buildRoute = () => {
      if (cancelled) return
      void buildRoadRoute(ymaps, routePoints)
        .then((coords) => {
          if (cancelled) return
          if (coords.length < 2) {
            setRouteBuildStateRef.current("error", "No route geometry")
            return
          }
          const routeLine = new ymaps.Polyline(coords, { hintContent: "KZ SPB" }, { strokeColor: ROUTE_COLOR, strokeOpacity: 0.96, strokeWidth: 4, strokeStyle: "solid" })
          routeLineRef.current = routeLine
          map.geoObjects.add(routeLine)
          const destination = routePoints[routePoints.length - 1]
          const destinationMarker = new ymaps.Placemark(destination, { hintContent: "SPB" }, { preset: "islands#redDotIcon", iconColor: ROUTE_COLOR })
          destinationRef.current = destinationMarker
          map.geoObjects.add(destinationMarker)
          setRoutePathFromMapRef.current(coords)
          try {
            const bounds = routeLine.geometry.getBounds?.()
            if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 64, duration: 0 })
          } catch {}
        })
        .catch(() => {
          if (!cancelled) setRouteBuildStateRef.current("error", "No route geometry")
        })
    }

    if ("requestIdleCallback" in window) {
      idleCallbackId = (window as any).requestIdleCallback(buildRoute, { timeout: STARTUP_ROUTE_DELAY_MS })
    } else {
      routeTimer = window.setTimeout(buildRoute, STARTUP_ROUTE_DELAY_MS)
    }

    return () => {
      cancelled = true
      if (idleCallbackId != null && "cancelIdleCallback" in window) (window as any).cancelIdleCallback(idleCallbackId)
      if (routeTimer != null) window.clearTimeout(routeTimer)
      clearRoute()
    }
  }, [routePoints, settings.routeMode, status])`

  content = replaceOnce(
    content,
    oldRouteEffect,
    newRouteEffect,
    'components/yandex-map.tsx',
    'defer route build and use one route request',
    'const buildRoute = () =>'
  )

  return content
})

edit('lib/sound.ts', (content) => {
  content = replaceOnce(
    content,
    `// Lightweight WebAudio alarm tones, no assets needed.
let ctx: AudioContext | null = null`,
    `// Lightweight WebAudio alarm tones, no assets needed.
let ctx: AudioContext | null = null
let audioUnlocked = false

type NavigatorWithUserActivation = Navigator & {
  userActivation?: {
    hasBeenActive?: boolean
    isActive?: boolean
  }
}

function hasUserActivatedAudio() {
  if (typeof navigator === "undefined") return false
  const activation = (navigator as NavigatorWithUserActivation).userActivation
  return audioUnlocked || Boolean(activation?.hasBeenActive || activation?.isActive)
}

function resumeAudio(audio: AudioContext) {
  if (audio.state !== "suspended") return
  try {
    void audio.resume().catch(() => {})
  } catch {}
}

function unlockAudio() {
  audioUnlocked = true
  const audio = getCtx()
  if (audio) resumeAudio(audio)
}

if (typeof window !== "undefined") {
  const options: AddEventListenerOptions = { once: true, passive: true, capture: true }
  window.addEventListener("pointerdown", unlockAudio, options)
  window.addEventListener("touchstart", unlockAudio, options)
  window.addEventListener("keydown", unlockAudio, { once: true, capture: true })
}`,
    'lib/sound.ts',
    'gate WebAudio until user gesture',
    'let audioUnlocked = false'
  )

  content = replaceOnce(
    content,
    `export function playAlarm(sound: AlarmSoundId = "beep", volume = 1) {
  const audio = getCtx()
  if (!audio) return
  if (audio.state === "suspended") void audio.resume()`,
    `export function playAlarm(sound: AlarmSoundId = "beep", volume = 1) {
  if (!hasUserActivatedAudio()) return
  const audio = getCtx()
  if (!audio) return
  resumeAudio(audio)`,
    'lib/sound.ts',
    'prevent autoplay AudioContext warnings for alarm',
    'if (!hasUserActivatedAudio()) return'
  )

  content = replaceOnce(
    content,
    `export function playBeep(volume = 1, frequency = 880, durationMs = 120) {
  const audio = getCtx()
  if (!audio) return
  if (audio.state === "suspended") void audio.resume()`,
    `export function playBeep(volume = 1, frequency = 880, durationMs = 120) {
  if (!hasUserActivatedAudio()) return
  const audio = getCtx()
  if (!audio) return
  resumeAudio(audio)`,
    'lib/sound.ts',
    'prevent autoplay AudioContext warnings for beep',
    'export function playBeep(volume = 1, frequency = 880, durationMs = 120) {\n  if (!hasUserActivatedAudio()) return'
  )

  return content
})

edit('app/globals.css', (content) => {
  content = replaceOnce(
    content,
    `@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; }
}`,
    `@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; }
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }
}

@media (max-width: 1023px), (prefers-reduced-transparency: reduce) {
  .glass,
  .glass-strong {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .map-dark-filter { filter: none; }
}`,
    'app/globals.css',
    'reduce animations and blur/filter cost',
    'prefers-reduced-transparency'
  )

  return content
})

console.log('Old-device optimization patch script completed.\n')
if (changed.length) {
  console.log('Changed:')
  for (const item of changed) console.log(`- ${item}`)
}
if (skipped.length) {
  console.log('\nSkipped:')
  for (const item of skipped) console.log(`- ${item}`)
}
