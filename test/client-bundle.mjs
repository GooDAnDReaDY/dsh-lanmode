import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const lib = path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib')

export function clientRuntimeSource() {
  const dir = path.join(lib, 'client-parts')
  const names = fs.readdirSync(dir).filter((name) => name.endsWith('.js')).sort()
  const chunks = names.map((name) => fs.readFileSync(path.join(dir, name), 'utf8'))
  chunks.push(fs.readFileSync(path.join(lib, 'client.js'), 'utf8'))
  return chunks.join('\n')
}
