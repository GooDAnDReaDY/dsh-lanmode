import test from 'node:test'
import assert from 'node:assert/strict'
import { mobileNavSource } from '../lib/mobile-nav.js'

test('Issue #171: long-press on a session row opens the overflow menu', () => {
  const nav = mobileNavSource()
  assert.ok(nav.includes('_sessionRow'))
  assert.ok(nav.includes('_rowActions'))
  assert.ok(nav.includes('500'))
  assert.ok(nav.includes('clearPress'))
  assert.ok(!nav.includes('e.stopPropagation()'))
})
