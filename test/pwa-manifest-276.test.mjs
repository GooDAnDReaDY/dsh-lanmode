import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultManifest } from '../lib/pwa-manifest.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Issue #276: webmanifest paths are public and registered', () => {
  assert.equal(defaultManifest.display, 'standalone')
  const pwa = readFileSync(path.join(here, '../lib/pwa-manifest.js'), 'utf8')
  assert.ok(pwa.includes('/manifest.webmanifest'))
  assert.ok(pwa.includes('/dsh-lanmode/manifest.webmanifest'))
  const bridge = readFileSync(path.join(here, '../lib/bridge-local.js'), 'utf8')
  assert.ok(bridge.includes('/manifest.webmanifest'))
  assert.ok(bridge.includes('manifest.webmanifest'))
})
