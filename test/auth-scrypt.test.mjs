import test from 'node:test'
import assert from 'node:assert/strict'
import { AuthManager, hashAuthPassword } from '../lib/auth.js'

test('Issue #248: scrypt password digests verify and reject wrong secrets', () => {
  const digest = hashAuthPassword('correct-horse')
  assert.ok(digest.startsWith('scrypt$'))
  const auth = new AuthManager()
  assert.equal(auth.verifyCredentials('admin', 'correct-horse', 'admin', digest), true)
  assert.equal(auth.verifyCredentials('admin', 'wrong-horse', 'admin', digest), false)
  assert.equal(auth.verifyCredentials('admin', 'plain', 'admin', 'plain'), true)
})
