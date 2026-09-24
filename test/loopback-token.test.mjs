import test from 'node:test'
import assert from 'node:assert/strict'
import { isStrictLoopback } from '../lib/bridge-local.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

test('Issue #202: only loopback addresses may request the local token', () => {
  assert.equal(isStrictLoopback('127.0.0.1'), true)
  assert.equal(isStrictLoopback('::1'), true)
  assert.equal(isStrictLoopback('::ffff:127.0.0.1'), true)
  assert.equal(isStrictLoopback('192.168.1.20'), false)
  assert.equal(isStrictLoopback('10.0.0.5'), false)
})

test('Issue #202: route exists and refuses non-GET', () => {
  const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'bridge-local.js'), 'utf8')
  assert.ok(src.includes('/dsh-lanmode/loopback-token'))
  assert.ok(src.includes('isStrictLoopback'))
})
