import fs from "node:fs"

const file = "lib/store.tsx"
let content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")

const replacements = [
  [/autoMove:\s*(true|false),/g, "autoMove: true,"],
  [/intervalMs:\s*[\d_]+,/g, "intervalMs: 1_000,"],
  [/followRoute:\s*(true|false),/g, "followRoute: true,"],
  [/direction:\s*"[^"]+",/g, 'direction: "NE",'],
  [/stepMeters:\s*[\d_]+,/g, "stepMeters: 5,"],
  [/routeMode:\s*(true|false),/g, "routeMode: false,"],
]

for (const [pattern, replacement] of replacements) {
  if (!pattern.test(content)) {
    throw new Error(`Pattern not found: ${pattern}`)
  }
  content = content.replace(pattern, replacement)
}

fs.writeFileSync(file, content, "utf8")
console.log("Default movement settings updated")
