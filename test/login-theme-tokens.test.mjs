import test from 'node:test'
import assert from 'node:assert/strict'
import { renderLoginPage } from '../lib/login-page.js'

test('Issue #287: login page styles use DSH --dsw-alias theme tokens', () => {
  const html = renderLoginPage({ publicHost: 'dsh.example' })
  assert.ok(html.includes('--dsw-alias-bg-layer-1'))
  assert.ok(html.includes('--dsw-alias-label-primary'))
  assert.ok(html.includes('--dsw-alias-state-brand-primary'))
  assert.ok(html.includes('--dsw-alias-border-subtle') || html.includes('border-subtle'))
})
