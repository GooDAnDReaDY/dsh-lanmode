import test from 'node:test'
import assert from 'node:assert/strict'
import { renderLoginPage } from '../lib/login-page.js'

test('Issue #308: initialError is properly escaped against XSS', () => {
  const html = renderLoginPage({ error: '<script>alert("xss")</script>' })
  assert.ok(!html.includes('<script>alert("xss")</script>'), 'must not contain raw script tag')
  assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'), 'must be HTML-escaped')
})

test('Issue #308: defaultUser is properly escaped against attribute injection', () => {
  const html = renderLoginPage({ defaultUser: 'admin" onfocus="alert(1)' })
  assert.ok(!html.includes('value="admin" onfocus="alert(1)"'), 'must not break out of attribute quotes')
  assert.ok(html.includes('value="admin&quot; onfocus=&quot;alert(1)"'), 'must escape quotes')
})
