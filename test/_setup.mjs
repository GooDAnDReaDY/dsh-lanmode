import fs from "node:fs"
import path from "node:path"
import os from "node:os"

if (!process.env.DSH_HOME) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-test-home-"))
  process.env.DSH_HOME = tmpDir
  fs.mkdirSync(path.join(tmpDir, ".dsh"), { recursive: true })

  process.on("exit", () => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })
}
