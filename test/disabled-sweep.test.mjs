import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AuthManager } from '../lib/auth.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Issue #267: sweepDisabled revokes sessions for named users only', () => {
  const auth = new AuthManager()
  const req = { socket: { remoteAddress: '10.0.0.1' }, headers: { 'user-agent': 'a' } }
  const kept = auth.createSession('admin', req, true)
  auth.createSession('guest', req, true)
  auth.createSession('guest', req, true)
  assert.equal(auth.sweepDisabled([' guest ', '']), 2)
  assert.ok(auth.validateSession(kept.token))
  assert.equal(auth.sweepDisabled('guest'), 0)
  const index = readFileSync(path.join(here, '..', 'lib', 'index.js'), 'utf8')
  assert.ok(index.includes('sweepDisabled(config.disabledUsers)'))
  assert.ok(index.includes('5000'))
  const schema = readFileSync(path.join(here, '..', 'lib', 'config-schema.js'), 'utf8')
  assert.ok(schema.includes('disabledUsers:'))
})
