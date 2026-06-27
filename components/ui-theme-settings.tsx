"use client"

import { useMemo } from "react"

import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

const THEME_PRESETS = [
  { id: "violet", name: "Violet", primary: "#7c3aed", secondary: "#a855f7" },
  { id: "cobalt", name: "Cobalt", primary: "#2563eb", secondary: "#06b6d4" },
  { id: "emerald", name: "Emerald", primary: "#059669", secondary: "#22c55e" },
  { id: "amber", name: "Amber", primary: "#d97706", secondary: "#f59e0b" },
  { id: "rose", name: "Rose", primary: "#e11d48", secondary: "#f97316" },
  { id: "cyan", name: "Cyan", primary: "#0891b2", secondary: "#14b8a6" },
  { id: "graphite", name: "Graphite", primary: "#475569", secondary: "#111827" },
  { id: "neon", name: "Neon", primary: "#8b5cf6", secondary: "#ec4899" },
  { id: "custom", name: "Своя", primary: "var(--primary)", secondary: "var(--secondary)" },
]

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function RangeRow({
  label,
  desc,
  value,
  min,
  max,
  step = 1,
  suffix = "%",
  onChange,
}: {
  label: string
  desc?: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}) {
  const safeValue = clamp(value, min, max, min)

  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {safeValue}{suffix}
        </span>
      </span>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
      />

      {desc && <span className="block text-xs leading-relaxed text-muted-foreground">{desc}</span>}
    </label>
  )
}

export function UiThemeSettings() {
  const { settings, updateSettings, theme } = useStore()

  const selectedPreset = settings.uiThemePreset ?? "violet"
  const previewStyle = useMemo(
    () => ({
      background: `linear-gradient(135deg, ${settings.customThemePrimary ?? "#7c3aed"}, ${settings.customThemeSecondary ?? "#a855f7"})`,
    }),
    [settings.customThemePrimary, settings.customThemeSecondary]
  )

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Темы и размер интерфейса
      </h3>

      <div className="space-y-5 rounded-xl bg-card px-4 py-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Цветовая тема интерфейса</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Меняет только интерфейс: кнопки, акценты, рамки и свечения. Цветовой тон карты не затрагивается.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => updateSettings({ uiThemePreset: preset.id })}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all hover:bg-accent active:scale-[0.98]",
                  selectedPreset === preset.id ? "border-primary bg-accent shadow-sm" : "border-border bg-background"
                )}
              >
                <span
                  className="mb-2 block h-5 rounded-md"
                  style={{
                    background:
                      preset.id === "custom"
                        ? previewStyle.background
                        : `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})`,
                  }}
                />
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div className={selectedPreset === "custom" ? "space-y-3" : "space-y-3 opacity-45"}>
          <div>
            <p className="text-sm font-semibold">Своя тема</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Выберите «Своя», чтобы эти цвета стали активной темой.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">Основной</span>
              <input
                type="color"
                value={settings.customThemePrimary ?? "#7c3aed"}
                onChange={(event) => updateSettings({ customThemePrimary: event.target.value, uiThemePreset: "custom" })}
                className="h-10 w-full rounded-lg border border-border bg-background p-1"
              />
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">Градиент</span>
              <input
                type="color"
                value={settings.customThemeSecondary ?? "#a855f7"}
                onChange={(event) => updateSettings({ customThemeSecondary: event.target.value, uiThemePreset: "custom" })}
                className="h-10 w-full rounded-lg border border-border bg-background p-1"
              />
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">Акцент</span>
              <input
                type="color"
                value={settings.customThemeAccent ?? "#ede9fe"}
                onChange={(event) => updateSettings({ customThemeAccent: event.target.value, uiThemePreset: "custom" })}
                className="h-10 w-full rounded-lg border border-border bg-background p-1"
              />
            </label>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-background/50 p-3">
          <div>
            <p className="text-sm font-semibold">Размерность интерфейса</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Настраивает общий масштаб, плотность, скругления и стеклянный блюр панелей.
            </p>
          </div>

          <RangeRow
            label="Масштаб интерфейса"
            desc="Меняет общий размер текста и элементов."
            value={settings.uiScale ?? 100}
            min={80}
            max={130}
            onChange={(value) => updateSettings({ uiScale: value })}
          />

          <RangeRow
            label="Плотность элементов"
            desc="Компенсирует ощущение тесноты интерфейса без изменения карты."
            value={settings.uiDensity ?? 100}
            min={80}
            max={135}
            onChange={(value) => updateSettings({ uiDensity: value })}
          />

          <RangeRow
            label="Скругления"
            value={settings.uiRadius ?? 100}
            min={40}
            max={200}
            onChange={(value) => updateSettings({ uiRadius: value })}
          />

          <RangeRow
            label="Блюр стекла"
            value={settings.uiBlur ?? 24}
            min={0}
            max={40}
            suffix="px"
            onChange={(value) => updateSettings({ uiBlur: value })}
          />
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-background/50 p-3">
          <div>
            <p className="text-sm font-semibold">Компенсация тёмной карты</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Работает только в тёмной теме и не меняет «Оттенок тёмной карты». Hue остаётся прежним.
            </p>
          </div>

          <RangeRow
            label="Яркость карты"
            value={settings.mapDarkBrightness ?? 88}
            min={55}
            max={130}
            onChange={(value) => updateSettings({ mapDarkBrightness: value })}
          />

          <RangeRow
            label="Контраст карты"
            value={settings.mapDarkContrast ?? 100}
            min={70}
            max={150}
            onChange={(value) => updateSettings({ mapDarkContrast: value })}
          />

          <RangeRow
            label="Насыщенность карты"
            value={settings.mapDarkSaturation ?? 130}
            min={50}
            max={180}
            onChange={(value) => updateSettings({ mapDarkSaturation: value })}
          />

          {theme !== "dark" && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Переключите тёмную тему, чтобы увидеть компенсацию карты.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
