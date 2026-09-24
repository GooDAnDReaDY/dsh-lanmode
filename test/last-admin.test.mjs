import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lastAdminLockout } from '../lib/admin-guard.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Issue #239: password auth cannot be left without a secret', () => {
  const on = { passwordAuth: true, authPassword: 'secret', authPasswordRef: '' }
  assert.equal(lastAdminLockout(on, { authPassword: '' }), true)
  assert.equal(lastAdminLockout(on, { authPassword: 'next' }), false)
  assert.equal(lastAdminLockout(on, { authPassword: '', authPasswordRef: 'PIN_REF' }), false)
  assert.equal(lastAdminLockout({ passwordAuth: false, authPassword: '', authPasswordRef: '' }, { passwordAuth: true }), true)
  assert.equal(lastAdminLockout(on, { passwordAuth: false, authPassword: '' }), false)
  const src = readFileSync(path.join(here, '..', 'lib', 'routes', 'config.js'), 'utf8')
  const lockAt = src.indexOf('lastAdminLockout(effective, patch)')
  const bootAt = src.indexOf('bootstrapBlocked(effective, patch, setupIp)')
  const writeAt = src.indexOf('effective[key] = patch[key]')
  assert.ok(lockAt > 0 && lockAt < bootAt && bootAt < writeAt)
})
