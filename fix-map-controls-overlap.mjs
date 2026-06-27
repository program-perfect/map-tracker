import fs from "node:fs"

const file = "components/map-controls.tsx"
let content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")

const oldBlock = `  return (
    <div className="flex animate-fade-in flex-col items-end gap-2">
      {/* rotation */}
      <div className="glass overflow-hidden rounded-lg">
        <CtrlButton
          onClick={toggleRotationMode}
          active={rotationMode === "movement"}
          label={
            rotationMode === "north"
              ? "Поворот: на север"
              : "Поворот: по движению"
          }
        >
          {rotationMode === "north" ? (
            <Compass className="size-5" />
          ) : (
            <Navigation2 className="size-5" />
          )}
        </CtrlButton>
      </div>

      {/* center on beacon */}
      <div className="glass overflow-hidden rounded-lg">
        <CtrlButton onClick={() => requestCenter()} label="Центрировать на маяке">
          <LocateFixed className="size-5 text-primary" />
        </CtrlButton>
      </div>

      {/* zoom */}
      <div className="glass flex flex-col overflow-hidden rounded-lg">
        <CtrlButton onClick={() => setZoom((z) => z + 1)} label="Приблизить">
          <Plus className="size-5" />
        </CtrlButton>
        <div className="h-px bg-border" />
        <CtrlButton onClick={() => setZoom((z) => z - 1)} label="Отдалить">
          <Minus className="size-5" />
        </CtrlButton>
      </div>
    </div>
  )`

const newBlock = `  return (
    <div className="relative z-30 flex animate-fade-in flex-col items-end">
      <div className="glass isolate flex flex-col overflow-hidden rounded-xl shadow-lg">
        <CtrlButton
          onClick={toggleRotationMode}
          active={rotationMode === "movement"}
          label={
            rotationMode === "north"
              ? "Поворот: на север"
              : "Поворот: по движению"
          }
        >
          {rotationMode === "north" ? (
            <Compass className="size-5" />
          ) : (
            <Navigation2 className="size-5" />
          )}
        </CtrlButton>

        <div className="h-px bg-border/70" />

        <CtrlButton onClick={() => requestCenter()} label="Центрировать на маяке">
          <LocateFixed className="size-5 text-primary" />
        </CtrlButton>

        <div className="h-px bg-border/70" />

        <CtrlButton onClick={() => setZoom((z) => z + 1)} label="Приблизить">
          <Plus className="size-5" />
        </CtrlButton>

        <div className="h-px bg-border/70" />

        <CtrlButton onClick={() => setZoom((z) => z - 1)} label="Отдалить">
          <Minus className="size-5" />
        </CtrlButton>
      </div>
    </div>
  )`

if (!content.includes(oldBlock)) {
  throw new Error("Cannot find old MapControls layout")
}

content = content.replace(oldBlock, newBlock)

content = content.replace(
  `"grid size-10 place-items-center text-foreground transition-all hover:bg-accent active:scale-90"`,
  `"relative grid size-10 place-items-center text-foreground transition-all hover:bg-accent active:scale-90"`
)

fs.writeFileSync(file, content, "utf8")
console.log("Map controls overlap fixed")
