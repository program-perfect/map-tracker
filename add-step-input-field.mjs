import fs from "node:fs"

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Cannot find block: ${label}`)
  }
  return content.replace(search, replacement)
}

const file = "components/panels/settings-panel.tsx"
let content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")

if (!content.includes("MIN_STEP_METERS")) {
  content = replaceOnce(
    content,
    `const MAX_INTERVAL_MS = 5 * 60_000`,
    `const MAX_INTERVAL_MS = 5 * 60_000
const MIN_STEP_METERS = 1
const DEFAULT_STEP_METERS = 5
const MAX_STEP_METERS = 30_000`,
    "step constants"
  )
}

if (!content.includes("function clampStepMeters")) {
  content = replaceOnce(
    content,
    `function formatInterval(ms: number) {`,
    `function clampStepMeters(value: number) {
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

function formatInterval(ms: number) {`,
    "movement step input row"
  )
}

content = content.replace(
  /<SliderRow label="Шаг перемещения" value=\{settings\.stepMeters\} display=\{`\$\{settings\.stepMeters\} м`\} min=\{\d+\} max=\{\d+\} step=\{\d+\} onChange=\{\(v\) => updateSettings\(\{ stepMeters: v \}\)\} \/>/,
  `<MovementStepRow value={settings.stepMeters} onChange={(v) => updateSettings({ stepMeters: v })} />`
)

if (!content.includes("<MovementStepRow value={settings.stepMeters}")) {
  throw new Error("Could not replace movement step slider")
}

fs.writeFileSync(file, content, "utf8")
console.log("Movement step input field added")
