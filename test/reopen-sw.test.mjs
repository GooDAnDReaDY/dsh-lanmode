import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REOPEN_SW } from '../lib/bridge-local.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Issue #177: service worker redirects bare / when a token was stored', () => {
  assert.ok(REOPEN_SW.includes("pathname !== '/'"))
  assert.ok(REOPEN_SW.includes('Response.redirect'))
  assert.ok(REOPEN_SW.includes('dsh-lanmode-token'))
  const shim = readFileSync(path.join(here, '..', 'lib', 'shim.js'), 'utf8')
  assert.ok(shim.includes('/dsh-lanmode/sw.js'))
  assert.ok(shim.includes('dsh_lanmode_reopen_token'))
})
