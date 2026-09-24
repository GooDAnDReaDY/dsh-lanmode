import test from 'node:test'
import assert from 'node:assert/strict'
import { AuthManager, hashAuthPassword } from '../lib/auth.js'

test('Issue #275: unknown user and wrong password both reject', () => {
  const auth = new AuthManager()
  const digest = hashAuthPassword('secret')
  assert.equal(auth.verifyCredentials('admin', 'secret', 'admin', digest), true)
  assert.equal(auth.verifyCredentials('nope', 'secret', 'admin', digest), false)
  assert.equal(auth.verifyCredentials('admin', 'wrong', 'admin', digest), false)
})

test('Issue #275: login route error text stays uniform', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../lib/routes/auth.js', import.meta.url), 'utf8')
  assert.ok(src.includes("Invalid username or password"))
  assert.equal((src.match(/Invalid username or password/g) || []).length >= 1, true)
  assert.ok(!src.includes('User not found'))
  assert.ok(!src.includes('user not found'))
})
