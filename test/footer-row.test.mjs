import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Issue #182: footer QR shares a row with settings', () => {
  const css = readFileSync(path.join(here, '../lib/client-parts/03-styles.js'), 'utf8')
  assert.ok(css.includes('[class$="_footArea"] { flex-direction:row'))
  assert.ok(css.includes('[class$="_footerActions"]'))
  assert.ok(css.includes('[class$="_settingsArea"]'))
})
