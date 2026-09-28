import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('Issue #333: ASCII QR is suppressed without DEBUG flag and logs are concise', () => {
  const indexSource = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

  // Verify ASCII QR is gated
  assert.ok(
    indexSource.includes('process.env.DEBUG || process.env.DSH_LANMODE_DEBUG_QR'),
    'ASCII QR must be gated by DEBUG or DSH_LANMODE_DEBUG_QR'
  )

  // Verify dangling JSDoc in lib/access.js is removed
  const accessSource = fs.readFileSync(new URL('../lib/access.js', import.meta.url), 'utf8')
  assert.ok(!accessSource.includes('Validates request Origin and Sec-Fetch-Site headers to guard against CSRF.\n * @param {object} req\n * @returns {boolean}\n */\n/**'), 'Dangling JSDoc must be removed')
})
