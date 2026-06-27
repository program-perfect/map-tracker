import fs from "node:fs"

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Cannot find block: ${label}`)
  }
  return content.replace(search, replacement)
}

const scrollAreaFile = "components/ui/scroll-area.tsx"
const settingsPanelFile = "components/panels/settings-panel.tsx"
const storeFile = "lib/store.tsx"

let scrollArea = fs.readFileSync(scrollAreaFile, "utf8").replace(/\r\n/g, "\n")
let settingsPanel = fs.readFileSync(settingsPanelFile, "utf8").replace(/\r\n/g, "\n")
let store = fs.readFileSync(storeFile, "utf8").replace(/\r\n/g, "\n")

if (!scrollArea.includes("hideScrollbar?: boolean")) {
  scrollArea = replaceOnce(
    scrollArea,
    `function ScrollArea({
  className,
  children,
  ...props
}: ScrollAreaPrimitive.Root.Props) {`,
    `type ScrollAreaProps = ScrollAreaPrimitive.Root.Props & {
  hideScrollbar?: boolean
}

function ScrollArea({
  className,
  children,
  hideScrollbar = false,
  ...props
}: ScrollAreaProps) {`,
    "add hideScrollbar prop"
  )

  scrollArea = replaceOnce(
    scrollArea,
    `      <ScrollBar />
      <ScrollAreaPrimitive.Corner />`,
    `      {!hideScrollbar && <ScrollBar />}
      {!hideScrollbar && <ScrollAreaPrimitive.Corner />}`,
    "conditionally hide scrollbar"
  )
}

if (!settingsPanel.includes("hideScrollbar")) {
  settingsPanel = settingsPanel.replace(
    `<ScrollArea className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">`,
    `<ScrollArea hideScrollbar className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">`
  )
}

store = store.replace(
  `  routeMode: true,`,
  `  routeMode: false,`
)

fs.writeFileSync(scrollAreaFile, scrollArea, "utf8")
fs.writeFileSync(settingsPanelFile, settingsPanel, "utf8")
fs.writeFileSync(storeFile, store, "utf8")

console.log("Hidden settings scrollbar and disabled default route mode")
