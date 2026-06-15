#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const root = process.cwd()

function filePath(...parts) {
  return path.join(root, ...parts)
}

function exists(rel) {
  return fs.existsSync(filePath(rel))
}

function read(rel) {
  return fs.readFileSync(filePath(rel), 'utf8')
}

function write(rel, content) {
  const absolute = filePath(rel)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, content, 'utf8')
  console.log(`updated ${rel}`)
}

function fail(message) {
  console.error(`\nERROR: ${message}`)
  process.exit(1)
}

function ensureReactHooksImport(source, hooks) {
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']react["']/
  const match = source.match(importRegex)

  if (!match) {
    return source.replace(/("use client"\s*)/, `$1\nimport { ${hooks.join(', ')} } from "react"\n`)
  }

  const current = match[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  const next = Array.from(new Set([...current, ...hooks]))
  return source.replace(importRegex, `import { ${next.join(', ')} } from "react"`)
}

const displayPreferences = `export const FULLSCREEN_DEFAULT_KEY = "map-tracker:fullscreen-default-enabled"
export const WAKE_LOCK_ENABLED_KEY = "map-tracker:wake-lock-enabled"
export const DISPLAY_PREFERENCES_EVENT = "map-tracker:display-preferences-change"

export type DisplayPreferences = {
  fullscreenDefault: boolean
  wakeLockEnabled: boolean
}

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  fullscreenDefault: true,
  wakeLockEnabled: true,
}

function readBooleanPreference(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback

  const value = window.localStorage.getItem(key)
  if (value === null) return fallback

  return value === "true"
}

export function readDisplayPreferences(): DisplayPreferences {
  return {
    fullscreenDefault: readBooleanPreference(
      FULLSCREEN_DEFAULT_KEY,
      DEFAULT_DISPLAY_PREFERENCES.fullscreenDefault,
    ),
    wakeLockEnabled: readBooleanPreference(
      WAKE_LOCK_ENABLED_KEY,
      DEFAULT_DISPLAY_PREFERENCES.wakeLockEnabled,
    ),
  }
}

export function saveDisplayPreferences(preferences: Partial<DisplayPreferences>) {
  if (typeof window === "undefined") return DEFAULT_DISPLAY_PREFERENCES

  const next = {
    ...readDisplayPreferences(),
    ...preferences,
  }

  window.localStorage.setItem(FULLSCREEN_DEFAULT_KEY, String(next.fullscreenDefault))
  window.localStorage.setItem(WAKE_LOCK_ENABLED_KEY, String(next.wakeLockEnabled))
  window.dispatchEvent(new CustomEvent<DisplayPreferences>(DISPLAY_PREFERENCES_EVENT, { detail: next }))

  return next
}
`

const displayModeManager = `"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Maximize2, Minimize2 } from "lucide-react"
import {
  DISPLAY_PREFERENCES_EVENT,
  readDisplayPreferences,
  type DisplayPreferences,
} from "@/lib/display-preferences"

type WakeLockSentinelLike = EventTarget & {
  released: boolean
  release: () => Promise<void>
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>
  }
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

function getFullscreenElement() {
  const fullscreenDocument = document as FullscreenDocument
  return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null
}

async function requestPageFullscreen() {
  const root = document.documentElement as FullscreenElement

  if (root.requestFullscreen) {
    await root.requestFullscreen()
    return
  }

  await root.webkitRequestFullscreen?.()
}

async function exitPageFullscreen() {
  const fullscreenDocument = document as FullscreenDocument

  if (document.exitFullscreen) {
    await document.exitFullscreen()
    return
  }

  await fullscreenDocument.webkitExitFullscreen?.()
}

export function DisplayModeManager() {
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const [preferences, setPreferences] = useState<DisplayPreferences>({
    fullscreenDefault: true,
    wakeLockEnabled: true,
  })
  const [isFullscreen, setIsFullscreen] = useState(false)

  const syncFullscreenState = useCallback(() => {
    setIsFullscreen(Boolean(getFullscreenElement()))
  }, [])

  const releaseWakeLock = useCallback(async () => {
    const wakeLock = wakeLockRef.current
    wakeLockRef.current = null

    if (wakeLock && !wakeLock.released) {
      await wakeLock.release().catch(() => undefined)
    }
  }, [])

  const requestWakeLock = useCallback(async () => {
    if (!preferences.wakeLockEnabled || document.visibilityState !== "visible") return

    const navigatorWithWakeLock = navigator as NavigatorWithWakeLock
    if (!navigatorWithWakeLock.wakeLock?.request) return
    if (wakeLockRef.current && !wakeLockRef.current.released) return

    try {
      const wakeLock = await navigatorWithWakeLock.wakeLock.request("screen")
      wakeLockRef.current = wakeLock
      wakeLock.addEventListener("release", () => {
        if (wakeLockRef.current === wakeLock) wakeLockRef.current = null
      })
    } catch {
      // Wake Lock can be blocked by unsupported browsers, low-power mode, or background tabs.
    }
  }, [preferences.wakeLockEnabled])

  useEffect(() => {
    setPreferences(readDisplayPreferences())

    const handlePreferencesChange = (event: Event) => {
      const customEvent = event as CustomEvent<DisplayPreferences>
      if (customEvent.detail) setPreferences(customEvent.detail)
    }

    const handleStorageChange = () => {
      setPreferences(readDisplayPreferences())
    }

    window.addEventListener(DISPLAY_PREFERENCES_EVENT, handlePreferencesChange)
    window.addEventListener("storage", handleStorageChange)

    return () => {
      window.removeEventListener(DISPLAY_PREFERENCES_EVENT, handlePreferencesChange)
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [])

  useEffect(() => {
    syncFullscreenState()

    document.addEventListener("fullscreenchange", syncFullscreenState)
    document.addEventListener("webkitfullscreenchange", syncFullscreenState)

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState)
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState)
    }
  }, [syncFullscreenState])

  useEffect(() => {
    if (!preferences.fullscreenDefault || isFullscreen) return

    const tryEnterFullscreen = async () => {
      if (!readDisplayPreferences().fullscreenDefault || getFullscreenElement()) return

      try {
        await requestPageFullscreen()
        syncFullscreenState()
      } catch {
        // Browser-gated. The next click, tap, or keypress will retry it.
      }
    }

    const handleFirstGesture = () => {
      void tryEnterFullscreen()
    }

    void tryEnterFullscreen()

    window.addEventListener("click", handleFirstGesture, { once: true })
    window.addEventListener("touchstart", handleFirstGesture, { once: true, passive: true })
    window.addEventListener("keydown", handleFirstGesture, { once: true })

    return () => {
      window.removeEventListener("click", handleFirstGesture)
      window.removeEventListener("touchstart", handleFirstGesture)
      window.removeEventListener("keydown", handleFirstGesture)
    }
  }, [preferences.fullscreenDefault, isFullscreen, syncFullscreenState])

  useEffect(() => {
    if (!preferences.wakeLockEnabled) {
      void releaseWakeLock()
      return
    }

    const activateWakeLock = () => {
      void requestWakeLock()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock()
      } else {
        void releaseWakeLock()
      }
    }

    void requestWakeLock()

    window.addEventListener("pointerdown", activateWakeLock, { passive: true })
    window.addEventListener("touchstart", activateWakeLock, { passive: true })
    window.addEventListener("keydown", activateWakeLock)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("pointerdown", activateWakeLock)
      window.removeEventListener("touchstart", activateWakeLock)
      window.removeEventListener("keydown", activateWakeLock)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      void releaseWakeLock()
    }
  }, [preferences.wakeLockEnabled, requestWakeLock, releaseWakeLock])

  async function handleFullscreenToggle() {
    try {
      if (getFullscreenElement()) {
        await exitPageFullscreen()
      } else {
        await requestPageFullscreen()
      }
    } finally {
      syncFullscreenState()
    }
  }

  return (
    <button
      type="button"
      onClick={handleFullscreenToggle}
      aria-label={isFullscreen ? "Выйти из полноэкранного режима" : "Войти в полноэкранный режим"}
      title={isFullscreen ? "Выйти из полноэкранного режима" : "Войти в полноэкранный режим"}
      className="fixed right-3 top-3 z-[100] grid size-10 place-items-center rounded-full border border-border bg-background/85 text-foreground shadow-lg backdrop-blur transition-all hover:bg-accent active:scale-95 sm:right-4 sm:top-4"
    >
      {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
    </button>
  )
}
`

write('lib/display-preferences.ts', displayPreferences)
write('components/display-mode-manager.tsx', displayModeManager)

// Patch app/layout.tsx
if (!exists('app/layout.tsx')) fail('app/layout.tsx not found. Run this script from the project root.')
let layout = read('app/layout.tsx')
if (!layout.includes('@/components/display-mode-manager')) {
  const globalsImport = /import ['"]\.\/globals\.css['"]\n/
  if (globalsImport.test(layout)) {
    layout = layout.replace(globalsImport, (m) => `${m}import { DisplayModeManager } from '@/components/display-mode-manager'\n`)
  } else {
    const imports = layout.match(/^(import[^\n]+\n)+/)
    if (!imports) fail('Could not find import block in app/layout.tsx')
    layout = layout.replace(imports[0], `${imports[0]}import { DisplayModeManager } from '@/components/display-mode-manager'\n`)
  }
}

if (!layout.includes('<DisplayModeManager />')) {
  if (layout.includes('{children}')) {
    layout = layout.replace('{children}', '{children}\n              <DisplayModeManager />')
  } else {
    fail('Could not find {children} in app/layout.tsx')
  }
}
write('app/layout.tsx', layout)

// Patch settings panel. The map-tracker app normally uses components/panels/settings-panel.tsx.
const settingsCandidates = [
  'components/panels/settings-panel.tsx',
  'components/chat/settings-page.tsx',
]
const settingsPath = settingsCandidates.find(exists)
if (!settingsPath) {
  console.warn('WARNING: Settings panel not found. Fullscreen and Wake Lock work, but settings toggles were not inserted.')
  process.exit(0)
}

let settings = read(settingsPath)
if (!settings.startsWith('"use client"') && !settings.startsWith("'use client'")) {
  settings = `"use client"\n\n${settings}`
}
settings = ensureReactHooksImport(settings, ['useEffect', 'useState'])

if (!settings.includes('@/lib/display-preferences')) {
  const displayImport = `import {\n  DISPLAY_PREFERENCES_EVENT,\n  readDisplayPreferences,\n  saveDisplayPreferences,\n  type DisplayPreferences,\n} from "@/lib/display-preferences"\n`
  const typeDirectionImport = /import type \{ Direction \} from ["']@\/lib\/types["']\n/
  if (typeDirectionImport.test(settings)) {
    settings = settings.replace(typeDirectionImport, (m) => `${m}${displayImport}`)
  } else {
    const lastImportMatch = [...settings.matchAll(/^import[^\n]+\n/gm)].at(-1)
    if (!lastImportMatch) fail(`Could not find imports in ${settingsPath}`)
    settings = `${settings.slice(0, lastImportMatch.index + lastImportMatch[0].length)}${displayImport}${settings.slice(lastImportMatch.index + lastImportMatch[0].length)}`
  }
}

if (!settings.includes('handleFullscreenDefaultChange')) {
  const stateBlock = `\n  const [fullscreenDefault, setFullscreenDefault] = useState(true)\n  const [wakeLockEnabled, setWakeLockEnabled] = useState(true)\n\n  useEffect(() => {\n    const applyDisplayPreferences = (preferences: DisplayPreferences) => {\n      setFullscreenDefault(preferences.fullscreenDefault)\n      setWakeLockEnabled(preferences.wakeLockEnabled)\n    }\n\n    applyDisplayPreferences(readDisplayPreferences())\n\n    const handlePreferencesChange = (event: Event) => {\n      const customEvent = event as CustomEvent<DisplayPreferences>\n      if (customEvent.detail) applyDisplayPreferences(customEvent.detail)\n    }\n\n    const handleStorageChange = () => {\n      applyDisplayPreferences(readDisplayPreferences())\n    }\n\n    window.addEventListener(DISPLAY_PREFERENCES_EVENT, handlePreferencesChange)\n    window.addEventListener("storage", handleStorageChange)\n\n    return () => {\n      window.removeEventListener(DISPLAY_PREFERENCES_EVENT, handlePreferencesChange)\n      window.removeEventListener("storage", handleStorageChange)\n    }\n  }, [])\n\n  function handleFullscreenDefaultChange(value: boolean) {\n    setFullscreenDefault(value)\n    saveDisplayPreferences({ fullscreenDefault: value })\n  }\n\n  function handleWakeLockEnabledChange(value: boolean) {\n    setWakeLockEnabled(value)\n    saveDisplayPreferences({ wakeLockEnabled: value })\n  }\n`

  const useStoreConst = /  const \{[^\n]+\} = useStore\(\)\n/
  if (!useStoreConst.test(settings)) fail(`Could not find the useStore() line in ${settingsPath}`)
  settings = settings.replace(useStoreConst, (m) => `${m}${stateBlock}`)
}

if (!settings.includes('Полноэкранный режим по умолчанию')) {
  if (!settings.includes('ToggleRow')) {
    fail(`${settingsPath} does not contain ToggleRow. Insert settings UI manually or send me the file.`)
  }

  const displayRows = `\n            <Divider />\n            <ToggleRow\n              label="Полноэкранный режим по умолчанию"\n              desc="После первого клика или тапа сайт разворачивается на весь экран"\n              checked={fullscreenDefault}\n              onChange={handleFullscreenDefaultChange}\n            />\n            <Divider />\n            <ToggleRow\n              label="Не выключать экран"\n              desc="Телефон не уходит в сон, пока сайт открыт и браузер поддерживает Wake Lock"\n              checked={wakeLockEnabled}\n              onChange={handleWakeLockEnabledChange}\n            />`

  const panelWidthSlider = /(<SliderRow[\s\S]*?panelWidth[\s\S]*?onChange=\{\(v\) => updateSettings\(\{ panelWidth: v \}\)\}[\s\S]*?\/>)/
  if (panelWidthSlider.test(settings)) {
    settings = settings.replace(panelWidthSlider, `$1${displayRows}`)
  } else {
    const firstSection = /(<Section[\s\S]*?>[\s\S]*?)(\n\s*<\/Section>)/
    if (!firstSection.test(settings)) fail(`Could not find a safe insertion point for settings toggles in ${settingsPath}`)
    settings = settings.replace(firstSection, `$1${displayRows}$2`)
  }
}

write(settingsPath, settings)
console.log('\nDone. Now run: pnpm build')
