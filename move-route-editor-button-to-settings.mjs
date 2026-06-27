import fs from "node:fs"

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Cannot find block: ${label}`)
  }
  return content.replace(search, replacement)
}

const settingsFile = "components/panels/settings-panel.tsx"
const menuFile = "components/route-editor-menu.tsx"

let settings = fs.readFileSync(settingsFile, "utf8").replace(/\r\n/g, "\n")
let menu = fs.readFileSync(menuFile, "utf8").replace(/\r\n/g, "\n")

// ---------- route-editor-menu.tsx ----------
// В обычном режиме не показываем плавающую кнопку снизу.
// Нижнее меню остаётся только когда редактор маршрута активен.
menu = menu.replace(
  /  if \(!routeEditorActive\) \{\s*return \(\s*<div className="pointer-events-auto">[\s\S]*?<\/div>\s*\)\s*\}/,
  `  if (!routeEditorActive) return null`
)

// ---------- settings-panel.tsx ----------
// Добавляем методы редактора маршрута в useStore().
if (!settings.includes("startRouteEditor,")) {
  settings = replaceOnce(
    settings,
    `    applyRoutePointsText,
  } = useStore()`,
    `    applyRoutePointsText,
    startRouteEditor,
    setActivePanel,
  } = useStore()`,
    "add route editor actions to settings panel"
  )
}

// Добавляем кнопку в самое начало настроек.
if (!settings.includes("Задать маршрут на карте")) {
  settings = replaceOnce(
    settings,
    `          <DisplayModeSettings />`,
    `          <Section title="Редактор маршрута">
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Включает режим выбора точек прямо на карте. Кликайте по улицам, домам или любым местам карты, затем сохраните или отмените маршрут в нижнем меню редактора.
              </p>

              <button
                type="button"
                onClick={() => {
                  startRouteEditor()
                  setActivePanel("map")
                }}
                className="w-full rounded-lg px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: "var(--grad-primary)", boxShadow: "var(--glow-primary)" }}
              >
                Задать маршрут на карте
              </button>
            </div>
          </Section>

          <DisplayModeSettings />`,
    "insert route editor button at settings top"
  )
}

fs.writeFileSync(settingsFile, settings, "utf8")
fs.writeFileSync(menuFile, menu, "utf8")

console.log("Route editor start button moved to settings top")
