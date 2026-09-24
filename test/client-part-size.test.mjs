import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

function lineCount(text) {
  if (!text) return 0
  const marks = text.match(/\n/g)
  return marks ? marks.length : 1
}

test('every lib javascript file parses and stays within 600 lines', () => {
  const lib = path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib')
  const files = []
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      if (fs.statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.js')) files.push(full)
    }
  }
  walk(lib)
  assert.ok(files.length > 10)
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    const lines = lineCount(text)
    assert.ok(lines <= 600, path.relative(lib, file) + ' has ' + lines + ' lines')
    const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    assert.equal(checked.status, 0, file + '\n' + checked.stderr)
  }
})
