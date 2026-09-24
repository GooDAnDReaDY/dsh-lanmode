import test from 'node:test'
import assert from 'node:assert/strict'
import { pickDshAuthCookie, mergeDshAuthCookie } from '../lib/dsh-auth-cookie.js'

test('Issue #261: pick the dsh-auth pair from Set-Cookie', () => {
  assert.equal(pickDshAuthCookie('dsh-auth-abc=secret; Path=/; HttpOnly'), 'dsh-auth-abc=secret')
  assert.equal(pickDshAuthCookie(['other=1', 'dsh-auth-ff=zz; Secure']), 'dsh-auth-ff=zz')
  assert.equal(pickDshAuthCookie('session=1'), '')
})

test('Issue #261: merge cached auth cookie only when the client lacks one', () => {
  assert.equal(mergeDshAuthCookie('', 'dsh-auth-abc=secret'), 'dsh-auth-abc=secret')
  assert.equal(mergeDshAuthCookie('a=1', 'dsh-auth-abc=secret'), 'a=1; dsh-auth-abc=secret')
  assert.equal(mergeDshAuthCookie('dsh-auth-abc=keep', 'dsh-auth-abc=other'), 'dsh-auth-abc=keep')
  assert.equal(mergeDshAuthCookie('a=1', ''), 'a=1')
})
