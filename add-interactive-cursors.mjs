import fs from "node:fs"

const file = "app/globals.css"
let content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")

const block = `
/* Interactive cursors */
button:not(:disabled),
a[href],
summary,
label,
select:not(:disabled),
[role="button"]:not([aria-disabled="true"]),
[role="tab"]:not([aria-disabled="true"]),
[role="switch"]:not([aria-disabled="true"]),
[role="checkbox"]:not([aria-disabled="true"]),
[role="radio"]:not([aria-disabled="true"]),
[data-slot="select-trigger"]:not([aria-disabled="true"]),
[data-slot="switch"]:not([aria-disabled="true"]),
input[type="button"]:not(:disabled),
input[type="submit"]:not(:disabled),
input[type="reset"]:not(:disabled),
input[type="checkbox"]:not(:disabled),
input[type="radio"]:not(:disabled),
input[type="range"]:not(:disabled),
input[type="color"]:not(:disabled) {
  cursor: pointer;
}

button:disabled,
select:disabled,
input:disabled,
textarea:disabled,
[aria-disabled="true"],
[data-disabled] {
  cursor: not-allowed;
}

input[type="text"]:not(:disabled),
input[type="number"]:not(:disabled),
input[type="time"]:not(:disabled),
input[type="search"]:not(:disabled),
input[type="email"]:not(:disabled),
input[type="password"]:not(:disabled),
input:not([type]):not(:disabled),
textarea:not(:disabled) {
  cursor: text;
}
`

if (!content.includes("/* Interactive cursors */")) {
  content += "\n" + block
}

fs.writeFileSync(file, content, "utf8")
console.log("Interactive pointer cursors added")
