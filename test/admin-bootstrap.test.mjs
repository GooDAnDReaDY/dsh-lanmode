import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootstrapBlocked } from '../lib/admin-guard.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Issue #238: the first secret can be set only from loopback', () => {
  const empty = { authPassword: '', authPasswordRef: '', passwordAuth: false }
  assert.equal(bootstrapBlocked(empty, { authPassword: 'secret' }, '10.1.1.1'), true)
  assert.equal(bootstrapBlocked(empty, { authPasswordRef: 'PIN_REF' }, '10.1.1.1'), true)
  assert.equal(bootstrapBlocked(empty, { passwordAuth: true }, '10.1.1.1'), true)
  assert.equal(bootstrapBlocked(empty, { authPassword: 'secret' }, '127.0.0.1'), false)
  assert.equal(bootstrapBlocked(empty, { authPassword: 'secret' }, '::ffff:127.0.0.1'), false)
  assert.equal(bootstrapBlocked(empty, { publicHost: 'lan.example' }, '10.1.1.1'), false)
  assert.equal(bootstrapBlocked({ authPassword: 'already' }, { authPassword: 'next' }, '10.1.1.1'), false)
  const src = readFileSync(path.join(here, '..', 'lib', 'routes', 'config.js'), 'utf8')
  const guardAt = src.indexOf('bootstrapBlocked(effective, patch, setupIp)')
  const writeAt = src.indexOf('effective[key] = patch[key]')
  assert.ok(guardAt > 0 && guardAt < writeAt)
})
