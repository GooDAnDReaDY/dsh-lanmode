import test from 'node:test'
import assert from 'node:assert/strict'
import { AuthManager, digestToken } from '../lib/auth.js'

test('Issue #266: server stores only SHA-256 digests of session tokens', () => {
  const auth = new AuthManager()
  const mockReq = { socket: { remoteAddress: '10.0.0.1' }, headers: { 'user-agent': 't' } }
  const session = auth.createSession('admin', mockReq, true)
  assert.ok(session.token)
  assert.equal(auth.sessions.has(session.token), false, 'raw token must not be a map key')
  assert.equal(auth.sessions.has(digestToken(session.token)), true)
  const stored = auth.sessions.get(digestToken(session.token))
  assert.ok(stored)
  assert.equal('token' in stored, false, 'stored record must not keep raw token')
  assert.ok(auth.validateSession(session.token))
  assert.equal(auth.validateSession('0' * session.token.length), null)
})
