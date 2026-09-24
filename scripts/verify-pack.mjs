#!/usr/bin/env node
// Fail when the publish set is too large or includes forbidden paths.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: root,
  encoding: 'utf8',
  shell: false,
  env: { ...process.env, npm_config_ignore_scripts: 'true' },
})
if (run.status !== 0) {
  console.error(run.stderr || run.stdout)
  process.exit(run.status || 1)
}

const parsed = JSON.parse(run.stdout)
const entry = Array.isArray(parsed) ? parsed[0] : parsed['@goodandready/dsh-lanmode'] || Object.values(parsed)[0]
if (!entry || !Array.isArray(entry.files)) {
  console.error('unexpected npm pack --json shape')
  process.exit(1)
}

const FORBIDDEN = /^(docs\/|AGENTS\.md$|index\.md$|deploy\.sh$|scripts\/|\.worktrees\/)/
const MAX_FILE = 256 * 1024
const MAX_PACKAGE = 512 * 1024
let total = 0
const errors = []

for (const file of entry.files) {
  const name = file.path || file.name
  const size = Number(file.size || 0)
  total += size
  if (FORBIDDEN.test(name)) errors.push(`forbidden path in pack: ${name}`)
  if (size > MAX_FILE) errors.push(`file too large (${size} B): ${name}`)
}

if (total > MAX_PACKAGE) errors.push(`package too large: ${total} B (limit ${MAX_PACKAGE} B)`)
if (total > 250 * 1024) {
  console.warn(`pack size ${total} B exceeds the aspirational 250 KiB budget; keep trimming when possible`)
}

if (errors.length) {
  console.error('Pack verification failed:')
  for (const line of errors) console.error(' -', line)
  process.exit(1)
}

console.log(`Pack verification passed: ${entry.files.length} files, ${total} bytes`)
