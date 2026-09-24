import assert from 'node:assert/strict'
import test from 'node:test'
import { renderLoginPage } from '../lib/login-page.js'

test('Issue #274: login page shows the confirmed public host', () => {
  const html = renderLoginPage({ publicHost: 'dsh.example.com', defaultUser: 'admin' })
  assert.match(html, /Instance:/)
  assert.match(html, /dsh\.example\.com/)
  assert.ok(!html.includes('<script>alert(1)</script>'))
  const escaped = renderLoginPage({ publicHost: '<script>alert(1)</script>' })
  assert.ok(escaped.includes('&lt;script&gt;'))
  assert.ok(!escaped.includes('<script>alert(1)</script>'))
})
