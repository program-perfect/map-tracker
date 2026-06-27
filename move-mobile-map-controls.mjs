import fs from "node:fs"

const file = "components/app-shell.tsx"
let content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")

const oldBlock = `<div className="pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2">
          <MapControls />
        </div>`

const newBlock = `<div className="pointer-events-auto absolute right-3 top-[calc(5.75rem+env(safe-area-inset-top))]">
          <MapControls />
        </div>`

if (!content.includes(oldBlock)) {
  throw new Error("Cannot find mobile MapControls position block")
}

content = content.replace(oldBlock, newBlock)

fs.writeFileSync(file, content, "utf8")
console.log("Moved mobile map controls away from beacon center")
