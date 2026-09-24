import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveLoginNotice, LOGIN_NOTICE_MESSAGES } from '../lib/login-page.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = readFileSync(path.join(here, '..', 'lib', 'login-page.js'), 'utf8')

test('Issue #277: only allowlisted notice ids resolve to text', () => {
  assert.equal(resolveLoginNotice('password-changed'), LOGIN_NOTICE_MESSAGES['password-changed'])
  assert.equal(resolveLoginNotice('session-expired'), LOGIN_NOTICE_MESSAGES['session-expired'])
  assert.equal(resolveLoginNotice('<script>alert(1)</script>'), '')
  assert.equal(resolveLoginNotice('password-changed"><img src=x onerror=alert(1)>'), '')
  assert.equal(resolveLoginNotice(''), '')
})

test('Issue #277: login page assigns notice via textContent not innerHTML', () => {
  assert.ok(src.includes("NOTICE_MAP"))
  assert.ok(src.includes("noticeMsg.textContent"))
  assert.ok(!src.includes('noticeMsg.innerHTML'))
  assert.ok(src.includes("get('notice')"))
})
