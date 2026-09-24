import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isLocalLanClient } from '../lib/network-interfaces.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Issue #245: adaptiveCompression is declared in config schema', () => {
  const src = readFileSync(path.join(here, '..', 'lib', 'config-schema.js'), 'utf8')
  assert.ok(src.includes('adaptiveCompression'))
  assert.ok(src.includes('remoteOnly') || src.includes('non-local'))
})

test('Issue #245: local clients are detected so compression can be skipped', () => {
  assert.equal(isLocalLanClient('127.0.0.1'), true)
  assert.equal(isLocalLanClient('::1'), true)
  assert.equal(isLocalLanClient('203.0.113.50'), false)
})

test('Issue #245: bridge skips compression for local clients when adaptive', () => {
  const src = readFileSync(path.join(here, '..', 'lib', 'bridge.js'), 'utf8')
  assert.ok(src.includes('adaptiveCompression'))
  assert.ok(src.includes('isLocalLanClient'))
  assert.ok(src.includes('createGzip'))
  assert.ok(src.includes('!options.adaptiveCompression || !isLocalLanClient'))
})
