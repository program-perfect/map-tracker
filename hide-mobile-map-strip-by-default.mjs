import fs from "node:fs"

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Cannot find block: ${label}`)
  }
  return content.replace(search, replacement)
}

const typesFile = "lib/types.ts"
const storeFile = "lib/store.tsx"
const appShellFile = "components/app-shell.tsx"
const settingsPanelFile = "components/panels/settings-panel.tsx"

let types = fs.readFileSync(typesFile, "utf8").replace(/\r\n/g, "\n")
let store = fs.readFileSync(storeFile, "utf8").replace(/\r\n/g, "\n")
let appShell = fs.readFileSync(appShellFile, "utf8").replace(/\r\n/g, "\n")
let settingsPanel = fs.readFileSync(settingsPanelFile, "utf8").replace(/\r\n/g, "\n")

if (!types.includes("mobileMapStripVisible")) {
  types = replaceOnce(
    types,
    `  panelWidth: number
}`,
    `  panelWidth: number
  mobileMapStripVisible: boolean
}`,
    "BeaconSettings.mobileMapStripVisible"
  )
}

if (!store.includes("mobileMapStripVisible")) {
  store = replaceOnce(
    store,
    `  panelWidth: 340,
}`,
    `  panelWidth: 340,
  mobileMapStripVisible: false,
}`,
    "DEFAULT_SETTINGS.mobileMapStripVisible"
  )
}

if (!appShell.includes("settings.mobileMapStripVisible")) {
  appShell = replaceOnce(
    appShell,
    `  if (!settings.visible) return null`,
    `  if (!settings.visible || !settings.mobileMapStripVisible) return null`,
    "hide MobileMapStrip by default"
  )
}

if (!settingsPanel.includes("Мобильная нижняя панель")) {
  settingsPanel = replaceOnce(
    settingsPanel,
    `            <ToggleRow label="Тёмная тема" desc="Синяя карта, тёмный интерфейс" checked={theme === "dark"} onChange={toggleTheme} />
          </Section>`,
    `            <ToggleRow label="Тёмная тема" desc="Синяя карта, тёмный интерфейс" checked={theme === "dark"} onChange={toggleTheme} />
            <Divider />
            <ToggleRow
              label="Мобильная нижняя панель"
              desc="Показывать на телефонах и планшетах карточку маяка с кнопкой «Сместить»"
              checked={settings.mobileMapStripVisible}
              onChange={(v) => updateSettings({ mobileMapStripVisible: v })}
            />
          </Section>`,
    "settings toggle for mobile strip"
  )
}

fs.writeFileSync(typesFile, types, "utf8")
fs.writeFileSync(storeFile, store, "utf8")
fs.writeFileSync(appShellFile, appShell, "utf8")
fs.writeFileSync(settingsPanelFile, settingsPanel, "utf8")

console.log("Mobile map strip hidden by default and settings toggle added")
