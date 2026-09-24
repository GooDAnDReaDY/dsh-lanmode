import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Issue #212: online event refreshes the core connection', () => {
  const src = readFileSync(path.join(here, '..', 'lib', 'client-parts', '09-apply.js'), 'utf8')
  assert.ok(src.includes("addEventListener('online', onVisible)"))
  assert.ok(src.includes('ctx.connection.refresh'))
  assert.ok(src.includes("removeEventListener('online', onVisible)"))
})
