import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'shim.js'), 'utf8')

test('Issue #178: shim sets __DSH_TRANSPORT__.ownsHost before bundles run', () => {
  assert.ok(src.includes('__DSH_TRANSPORT__'))
  assert.ok(src.includes('ownsHost = true'))
  assert.ok(src.includes('loopbackAnswer'))
})
