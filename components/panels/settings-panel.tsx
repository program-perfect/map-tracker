"use client"

import { useState } from "react"

import { useStore } from "@/lib/store"
import { PanelHeader } from "@/components/panels/panel-header"
import { ScenarioEditor } from "@/components/panels/scenario-editor"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ALARM_SOUND_OPTIONS, playAlarm } from "@/lib/sound"
import { getSliderNumber } from "@/lib/slider-value"
import type { AlarmSoundId, Direction, RouteBuildStatus } from "@/lib/types"
import { DisplayModeSettings } from "@/components/display-mode-settings"

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: "N", label: "Север ↑" },
  { value: "NE", label: "Северо-восток ↗" },
  { value: "E", label: "Восток →" },
  { value: "SE", label: "Юго-восток ↘" },
  { value: "S", label: "Юг ↓" },
  { value: "SW", label: "Юго-запад ↙" },
  { value: "W", label: "Запад ←" },
  { value: "NW", label: "Северо-запад ↖" },
]

const MIN_MARKER_SIZE = 30
const MAX_MARKER_SIZE = 64
const MIN_INTERVAL_MS = 1
const DEFAULT_INTERVAL_MS = 5_000
const MAX_INTERVAL_MS = 5 * 60_000
const MIN_STEP_METERS = 1
const DEFAULT_STEP_METERS = 5
const MAX_STEP_METERS = 30_000

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      <div className="space-y-4 rounded-xl bg-card px-4 py-4">{children}</div>
    </section>
  )
}

function Divider() {
  return <div className="h-px bg-border/60" />
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-0.5">
      <span>
        <span className="block text-sm font-medium leading-snug">{label}</span>
        {desc && <span className="block text-xs leading-snug text-muted-foreground">{desc}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  )
}

function SliderRow({ label, value, display, min, max, step, onChange, disabled }: { label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className={disabled ? "space-y-2 opacity-40 pointer-events-none" : "space-y-2"}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{display}</span>
      </div>
      <Slider value={value} min={min} max={max} step={step} disabled={disabled} onValueChange={(next) => onChange(getSliderNumber(next))} aria-label={label} />
    </div>
  )
}

function clampStepMeters(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_STEP_METERS
  return Math.max(MIN_STEP_METERS, Math.min(MAX_STEP_METERS, Math.round(value)))
}

function MovementStepRow({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const safeValue = clampStepMeters(value || DEFAULT_STEP_METERS)

  return (
    <div className={disabled ? "space-y-3 opacity-40 pointer-events-none" : "space-y-3"}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">Шаг перемещения</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={MIN_STEP_METERS}
            max={MAX_STEP_METERS}
            step={1}
            value={safeValue}
            disabled={disabled}
            onChange={(e) => {
              const next = Number(e.target.value)
              if (!Number.isNaN(next)) onChange(clampStepMeters(next))
            }}
            className="h-7 w-24 rounded-md bg-background px-2 text-right font-mono text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Шаг перемещения в метрах"
          />
          <span className="text-xs text-muted-foreground">м</span>
        </div>
      </div>

      <Slider
        value={safeValue}
        min={MIN_STEP_METERS}
        max={MAX_STEP_METERS}
        step={1}
        disabled={disabled}
        onValueChange={(next) => onChange(clampStepMeters(getSliderNumber(next)))}
        aria-label="Шаг перемещения"
      />

      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>1 м</span>
        <span className="tabular-nums">{safeValue} м</span>
        <span>30 км</span>
      </div>
    </div>
  )
}

function formatInterval(ms: number) {
  if (ms < 1000) return `${ms} мс`
  if (ms < 60_000) return `${Number.isInteger(ms / 1000) ? ms / 1000 : (ms / 1000).toFixed(1)} с`
  return `${Number.isInteger(ms / 60_000) ? ms / 60_000 : (ms / 60_000).toFixed(1)} мин`
}

function routeStatusLabel(status: RouteBuildStatus) {
  switch (status) {
    case "building":
      return "строится"
    case "ready":
      return "готов"
    case "error":
      return "ошибка"
    case "idle":
    default:
      return "выключен"
  }
}

function IntervalRow({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const safeValue = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, value || DEFAULT_INTERVAL_MS))

  return (
    <div className={disabled ? "space-y-3 opacity-40 pointer-events-none" : "space-y-3"}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">Интервал движения</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={MIN_INTERVAL_MS}
            max={MAX_INTERVAL_MS}
            step={1}
            value={safeValue}
            disabled={disabled}
            onChange={(e) => {
              const next = Number(e.target.value)
              if (!Number.isNaN(next)) onChange(Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.round(next))))
            }}
            className="h-7 w-24 rounded-md bg-background px-2 text-right font-mono text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Интервал движения в миллисекундах"
          />
          <span className="text-xs text-muted-foreground">мс</span>
        </div>
      </div>
      <Slider
        value={safeValue}
        min={MIN_INTERVAL_MS}
        max={MAX_INTERVAL_MS}
        step={100}
        disabled={disabled}
        onValueChange={(next) => onChange(Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.round(getSliderNumber(next)))))}
        aria-label="Интервал движения"
      />
      <div className="flex flex-wrap gap-2">
        {[500, 1000, DEFAULT_INTERVAL_MS, 10_000, 60_000, MAX_INTERVAL_MS].map((ms) => (
          <button
            key={ms}
            type="button"
            disabled={disabled}
            onClick={() => onChange(ms)}
            className="rounded-lg bg-background px-2.5 py-1.5 text-xs font-medium tabular-nums transition-colors hover:bg-accent disabled:opacity-40"
          >
            {formatInterval(ms)}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>1 мс</span>
        <span className="tabular-nums">{formatInterval(safeValue)}</span>
        <span>5 мин</span>
      </div>
    </div>
  )
}

export function SettingsPanel() {
  const {
    settings,
    updateSettings,
    resetSettings,
    resetPosition,
    theme,
    toggleTheme,
    zoom,
    setZoom,
    routePointsText,
    routePath,
    routeStatus,
    routeError,
    updateRoutePointsText,
    applyRoutePointsText,
  } = useStore()
  const markerSize = Math.max(MIN_MARKER_SIZE, Math.min(MAX_MARKER_SIZE, settings.markerSize ?? MIN_MARKER_SIZE))
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <PanelHeader title="Настройки" subtitle="Параметры маяка и приложения" />
      </div>

      <ScrollArea hideScrollbar className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="space-y-6 px-4 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <DisplayModeSettings />
          <Section title="Сброс">
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Положение точки сохраняется между сессиями. Его можно сбросить отдельно или вместе со всеми настройками.
              </p>

              <button
                type="button"
                onClick={resetPosition}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-semibold transition-colors hover:bg-accent active:scale-[0.98]"
              >
                Сбросить положение точки
              </button>

              <button
                type="button"
                onClick={() => setResetDialogOpen(true)}
                className="w-full rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/15 active:scale-[0.98]"
              >
                Сбросить все настройки
              </button>
            </div>
          </Section>

          <Section title="Интерфейс">
            <SliderRow label="Ширина панели" value={settings.panelWidth} display={`${settings.panelWidth} px`} min={240} max={520} step={20} onChange={(v) => updateSettings({ panelWidth: v })} />
          </Section>

          <Section title="Отображение">
            <ToggleRow label="Показывать маяк" desc="Точка на карте" checked={settings.visible} onChange={(v) => updateSettings({ visible: v })} />
            <Divider />
            <div className="flex items-center justify-between gap-4 py-0.5">
              <span><span className="block text-sm font-medium leading-snug">Цвет маяка</span><span className="block text-xs leading-snug text-muted-foreground">Нажмите на круг, чтобы выбрать цвет</span></span>
              <label className="flex cursor-pointer items-center gap-2.5">
                <span className="size-7 rounded-full border-2 border-border shadow-inner transition-transform hover:scale-110" style={{ background: settings.beaconColor }} aria-hidden />
                <input type="color" value={settings.beaconColor} onChange={(e) => updateSettings({ beaconColor: e.target.value })} className="sr-only" aria-label="Цвет маяка" />
                <span className="font-mono text-xs text-muted-foreground">{settings.beaconColor}</span>
              </label>
            </div>
            <Divider />
            <SliderRow label="Размер маркера" value={markerSize} display={`${markerSize} px`} min={MIN_MARKER_SIZE} max={MAX_MARKER_SIZE} step={2} onChange={(v) => updateSettings({ markerSize: v })} />
            <Divider />
            <ToggleRow label="Тёмная тема" desc="Синяя карта, тёмный интерфейс" checked={theme === "dark"} onChange={toggleTheme} />
            <Divider />
            <ToggleRow
              label="Мобильная нижняя панель"
              desc="Показывать на телефонах и планшетах карточку маяка с кнопкой «Сместить»"
              checked={settings.mobileMapStripVisible}
              onChange={(v) => updateSettings({ mobileMapStripVisible: v })}
            />
          </Section>

          <Section title="Карта">
            <SliderRow label="Масштаб" value={zoom} display={`${zoom}`} min={5} max={19} step={1} onChange={(v) => setZoom(v)} />
            <Divider />
            <SliderRow label="Оттенок тёмной карты" value={settings.mapHue} display={`${settings.mapHue}°`} min={0} max={359} step={1} disabled={theme !== "dark"} onChange={(v) => updateSettings({ mapHue: v })} />
            {theme !== "dark" && <p className="text-xs text-muted-foreground">Переключите в тёмную тему, чтобы изменить оттенок карты</p>}
          </Section>

          <Section title="Маршрут Казахстан → Санкт-Петербург">
            <ToggleRow
              label="Режим маршрута"
              desc="Маяк идёт по автомобильной геометрии Яндекс Карт, а не по прямой"
              checked={settings.routeMode}
              onChange={(v) => updateSettings({ routeMode: v, followRoute: v ? true : settings.followRoute })}
            />
            <Divider />
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">Точки маршрута</span>
                <span className="rounded-full bg-background px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {routeStatusLabel(routeStatus)} · {routePath.length} узл.
                </span>
              </div>
              <textarea
                value={routePointsText}
                onChange={(e) => updateRoutePointsText(e.target.value)}
                rows={8}
                spellCheck={false}
                className="min-h-40 w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                aria-label="Точки маршрута"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Формат: одна координата на строку — широта, долгота. После применения карта строит автомобильный маршрут по дорогам и двигает точку по этой линии.
              </p>
              {routeError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{routeError}</p>}
              <button
                type="button"
                onClick={applyRoutePointsText}
                className="w-full rounded-lg px-4 py-3 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98]"
                style={{ background: "var(--grad-primary)", boxShadow: "var(--glow-primary)" }}
              >
                Применить точки и перестроить маршрут
              </button>
            </div>
            <Divider />
            <ToggleRow label="Зациклить маршрут" desc="После Санкт-Петербурга возвращать маяк в стартовую точку" checked={settings.routeLoop} onChange={(v) => updateSettings({ routeLoop: v })} />
          </Section>

          <Section title="Передвижение">
            <p className="text-xs text-muted-foreground">Нажмите на карту, чтобы установить маяк — отсюда он продолжит движение.</p>
            <ToggleRow label="Автодвижение" desc="Маяк периодически смещается по дорогам" checked={settings.autoMove} onChange={(v) => updateSettings({ autoMove: v })} />
            <Divider />
            <IntervalRow value={settings.intervalMs} onChange={(v) => updateSettings({ intervalMs: v })} disabled={!settings.autoMove || settings.scenarioEnabled} />
            <Divider />
            <ToggleRow label="Двигаться по дорогам" desc="В режиме маршрута используется красная дорожная линия; без него — локальный граф улиц" checked={settings.followRoute} onChange={(v) => updateSettings({ followRoute: v })} />
            <div className="space-y-2"><span className="text-sm font-medium">Направление</span><Select value={settings.direction} onValueChange={(v) => updateSettings({ direction: v as Direction })} disabled={settings.followRoute || settings.routeMode}><SelectTrigger className="w-full" aria-label="Направление движения"><SelectValue /></SelectTrigger><SelectContent>{DIRECTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent></Select></div>
            <MovementStepRow value={settings.stepMeters} onChange={(v) => updateSettings({ stepMeters: v })} />
          </Section>

          <Section title="Сценарии движения">
            <p className="text-xs text-muted-foreground">Сценарий — это последовательность шагов с индивидуальной задержкой и расстоянием. Если режим маршрута включён, шаги идут по красной дорожной линии.</p>
            <ScenarioEditor />
          </Section>

          <Section title="Расписание">
            <ToggleRow label="Перемещение по времени" desc="Двигаться в заданный момент" checked={settings.scheduledMove} onChange={(v) => updateSettings({ scheduledMove: v })} />
            <div className={settings.scheduledMove ? "space-y-2" : "space-y-2 opacity-40 pointer-events-none"}><span className="text-sm font-medium">Время</span><Input type="time" value={settings.scheduleAt} disabled={!settings.scheduledMove} onChange={(e) => updateSettings({ scheduleAt: e.target.value })} className="w-full" aria-label="Время перемещения" /></div>
          </Section>

          <Section title="Пульсация">
            <ToggleRow label="Пульсация точки" desc="Анимация вокруг маяка" checked={settings.pulseEnabled} onChange={(v) => updateSettings({ pulseEnabled: v })} />
            <Divider />
            <SliderRow label="Скорость пульса" value={settings.pulseDurationMs} display={`${(settings.pulseDurationMs / 1000).toFixed(1)} с`} min={600} max={4000} step={100} disabled={!settings.pulseEnabled} onChange={(v) => updateSettings({ pulseDurationMs: v })} />
            <SliderRow label="Размер пульса" value={settings.pulseScale} display={`×${settings.pulseScale.toFixed(1)}`} min={1.5} max={5} step={0.5} disabled={!settings.pulseEnabled} onChange={(v) => updateSettings({ pulseScale: v })} />
          </Section>

          <Section title="Звук">
            <ToggleRow label="Звуковой сигнал" desc="Основной звук маяка и тревог" checked={settings.soundEnabled} onChange={(v) => { updateSettings({ soundEnabled: v }); if (v) playAlarm(settings.alarmSound, settings.soundVolume) }} />
            <Divider />
            <ToggleRow label="Постоянная сигнализация" desc="Повторять сигнал в ритм пульсации, даже если точка стоит" checked={settings.continuousAlarm} onChange={(v) => updateSettings({ continuousAlarm: v })} />
            <Divider />
            <div className={settings.soundEnabled ? "space-y-2" : "space-y-2 opacity-40 pointer-events-none"}>
              <span className="text-sm font-medium">Тип сигнала</span>
              <Select value={settings.alarmSound} onValueChange={(v) => updateSettings({ alarmSound: v as AlarmSoundId })} disabled={!settings.soundEnabled}><SelectTrigger className="w-full" aria-label="Тип тревожного сигнала"><SelectValue /></SelectTrigger><SelectContent>{ALARM_SOUND_OPTIONS.map((sound) => <SelectItem key={sound.id} value={sound.id}>{sound.label}</SelectItem>)}</SelectContent></Select>
              <p className="text-xs text-muted-foreground">{ALARM_SOUND_OPTIONS.find((sound) => sound.id === settings.alarmSound)?.description}</p>
            </div>
            <Divider />
            <SliderRow label="Громкость" value={Math.round(settings.soundVolume * 100)} display={`${Math.round(settings.soundVolume * 100)}%`} min={0} max={100} step={5} disabled={!settings.soundEnabled} onChange={(v) => updateSettings({ soundVolume: v / 100 })} />
            <button type="button" disabled={!settings.soundEnabled} onClick={() => playAlarm(settings.alarmSound, settings.soundVolume)} className="w-full rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-40">Проверить сигнал</button>
          </Section>
        </div>
      </ScrollArea>

      {resetDialogOpen && (
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-settings-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl"
          >
            <h2 id="reset-settings-title" className="text-base font-semibold">
              Подтвердить сброс
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Будут сброшены все настройки, маршрут, звук, отображение и положение точки. Локально сохранённые данные будут перезаписаны значениями по умолчанию.
            </p>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setResetDialogOpen(false)}
                className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  resetSettings()
                  setResetDialogOpen(false)
                }}
                className="flex-1 rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Сбросить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
