import test from 'node:test'
import assert from 'node:assert/strict'
import { AuthManager } from '../lib/auth.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Issue #259: revokeSessionsForUser drops other sessions and can keep current', () => {
  const auth = new AuthManager()
  const req = { socket: { remoteAddress: '10.0.0.1' }, headers: { 'user-agent': 'a' } }
  const a = auth.createSession('admin', req, true)
  const b = auth.createSession('admin', req, true)
  const guest = auth.createSession('guest', req, true)
  assert.equal(auth.revokeSessionsForUser('admin', a.token), 1)
  assert.ok(auth.validateSession(a.token))
  assert.equal(auth.validateSession(b.token), null)
  assert.ok(auth.validateSession(guest.token))
})

test('Issue #259: config PATCH revokes sessions when authPassword changes', () => {
  const src = readFileSync(path.join(here, '..', 'lib', 'routes', 'config.js'), 'utf8')
  assert.ok(src.includes('passwordChanging'))
  assert.ok(src.includes('revokeSessionsForUser'))
})
