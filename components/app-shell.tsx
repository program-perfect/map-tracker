"use client"

import { useStore } from "@/lib/store"
import { YandexMap } from "@/components/yandex-map"
import { TopBar } from "@/components/top-bar"
import { BottomNav } from "@/components/bottom-nav"
import { DesktopRail } from "@/components/desktop-rail"
import { MapControls } from "@/components/map-controls"
import { LayersControl } from "@/components/layers-control"
import { ScaleBar } from "@/components/scale-bar"
import { PanelContent } from "@/components/panel-content"

export function AppShell() {
  const { activePanel } = useStore()
  const panelOpen = activePanel !== "map" || true // map panel also shown on desktop sidebar

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* Map base layer */}
      <div className="absolute inset-0">
        <YandexMap />
      </div>

      {/* ============ DESKTOP (lg+) ============ */}
      <div className="pointer-events-none absolute inset-0 hidden lg:block">
        <div className="flex h-full">
          {/* left rail */}
          <div className="pointer-events-auto h-full">
            <DesktopRail />
          </div>
          {/* left sliding panel */}
          <div className="glass-strong pointer-events-auto h-full w-[340px] animate-fade-in border-y-0 border-l-0">
            <PanelContent />
          </div>
          {/* spacer for map interaction */}
          <div className="flex-1" />
        </div>

        {/* right-side: top bar (moved to right area on desktop per spec) */}
        <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-3">
          <div className="pointer-events-auto">
            <TopBar />
          </div>
          <div className="pointer-events-auto">
            <LayersControl />
          </div>
        </div>

        {/* right-side map controls */}
        <div className="pointer-events-auto absolute bottom-8 right-4">
          <MapControls />
        </div>

        {/* scale bottom-right on desktop */}
        <div className="pointer-events-none absolute bottom-4 right-20">
          <ScaleBar />
        </div>
      </div>

      {/* ============ MOBILE / TABLET (<lg) ============ */}
      <div className="pointer-events-none absolute inset-0 lg:hidden">
        {/* top bar with limited functions */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <div className="pointer-events-auto">
            <TopBar />
          </div>
          <div className="pointer-events-auto">
            <LayersControl />
          </div>
        </div>

        {/* right map controls */}
        <div className="pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2">
          <MapControls />
        </div>

        {/* scale bottom-left on mobile/tablet */}
        <div className="pointer-events-none absolute bottom-44 left-3">
          <ScaleBar />
        </div>

        {/* bottom sheet panel (only when a non-map panel is active) */}
        {activePanel !== "map" ? (
          <div className="glass-strong pointer-events-auto absolute inset-x-0 bottom-[84px] mx-2 max-h-[55dvh] animate-sheet-up overflow-hidden rounded-2xl">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" />
            <div className="h-[52dvh]">
              <PanelContent />
            </div>
          </div>
        ) : (
          <MobileMapStrip />
        )}

        {/* bottom nav */}
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 p-2">
          <BottomNav />
        </div>
      </div>
    </div>
  )
}

function MobileMapStrip() {
  const { settings, speedKmh, street, moving, moveOnce } = useStore()
  if (!settings.visible) return null
  return (
    <div className="glass pointer-events-auto absolute inset-x-0 bottom-[84px] mx-2 flex animate-sheet-up items-center gap-3 rounded-2xl px-3 py-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-beacon/15">
        <span className="size-2.5 rounded-full bg-beacon" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">Маяк-01 · {moving ? "в движении" : "на месте"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {street} · {speedKmh} км/ч
        </p>
      </div>
      <button
        type="button"
        onClick={moveOnce}
        className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-90"
      >
        Сместить
      </button>
    </div>
  )
}
