#!/usr/bin/env node
// Remove local junk that must never enter the npm tarball.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const junkNames = new Set([
  '.DS_Store',
  'Thumbs.db',
  'npm-debug.log',
  'yarn-error.log',
])
const junkSuffixes = ['.tgz', '.tar', '.tar.gz', '.map', '.tmp', '.bak']

let removed = 0

function walk(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (_) {
    return
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.worktrees') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    const lower = entry.name.toLowerCase()
    const bad = junkNames.has(entry.name) || junkSuffixes.some((suffix) => lower.endsWith(suffix))
    if (!bad) continue
    fs.unlinkSync(full)
    removed += 1
    console.log('removed', path.relative(root, full))
  }
}

walk(root)
console.log(`clean-pack: removed ${removed} junk file(s)`)
