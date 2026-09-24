import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const clean = path.join(here, '..', 'scripts/clean-pack.mjs')
const verify = path.join(here, '..', 'scripts/verify-pack.mjs')

test('Issue #194: clean-pack removes junk archives', () => {
  const junk = path.join(here, '..', '_tmp-pack-junk.tgz')
  fs.writeFileSync(junk, 'junk')
  try {
    const run = spawnSync(process.execPath, [clean], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr || run.stdout)
    assert.equal(fs.existsSync(junk), false)
  } finally {
    if (fs.existsSync(junk)) fs.unlinkSync(junk)
  }
})

test('Issue #194: verify-pack rejects forbidden paths and oversized files', () => {
  const run = spawnSync(process.execPath, [verify], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr || run.stdout)
  assert.match(run.stdout, /Pack verification passed/)
})
