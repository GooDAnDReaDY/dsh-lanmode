import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(here, '..', 'scripts/check-licenses.mjs')

test('Issue #190: license checker accepts the MIT package', () => {
  const run = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr || run.stdout)
  assert.match(run.stdout, /License check passed/)
})
