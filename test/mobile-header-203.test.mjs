import test from 'node:test'
import assert from 'node:assert/strict'
import { mobileStyles } from '../lib/mobile-styles.js'

test('Issue #203: mobile header styling matches DeepSeek App look-and-feel', () => {
  const css = mobileStyles()

  // 1. Compact header height (48px + safe-area)
  assert.ok(css.includes('--dsh-mobile-header-h: calc(48px + env(safe-area-inset-top, 0px))'))

  // 2. Glassmorphism backdrop-filter blur
  assert.ok(css.includes('backdrop-filter: blur(16px) saturate(180%)'))
  assert.ok(css.includes('-webkit-backdrop-filter: blur(16px) saturate(180%)'))

  // 3. Subtle border matching DSH design tokens
  assert.ok(css.includes('border-bottom: 1px solid var(--dsw-alias-border-subtle'))

  // 4. Centered title styling with ellipsis
  assert.ok(css.includes('text-align: center !important'))
  assert.ok(css.includes('font-weight: 600 !important'))

  // 5. Active micro-interaction touch feedback for header buttons
  assert.ok(css.includes('transform: scale(0.95) !important'))
})
