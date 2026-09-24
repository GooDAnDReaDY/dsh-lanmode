import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { forceLoopback } from '../lib/loopback-source.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Issue #233: client apply forces connection.isLoopback for remote UI gates', () => {
  const src = readFileSync(path.join(here, '..', 'lib', 'client-parts', '09-apply.js'), 'utf8')
  assert.ok(src.includes('ctx.connection.isLoopback = true'))
})

test('Issue #233: connection bundle rewrite still forces isLoopback', () => {
  const sample = 'isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname),'
  const out = forceLoopback('prefix ' + sample + ' suffix')
  assert.equal(out.changed, true)
  assert.ok(out.source.includes('isLoopback: true,'))
})
