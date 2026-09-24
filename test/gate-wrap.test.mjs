import test from 'node:test'
import assert from 'node:assert/strict'
import { gateWrap, GATED } from '../lib/gate.js'

test('Issue #286: a second wrap replaces the previous layer instead of nesting', () => {
  const calls = []
  const original = (value) => { calls.push('orig:' + value); return value }
  const once = gateWrap(original, (fn) => (value) => { calls.push('a'); return fn(value + 1) })
  const twice = gateWrap(once, (fn) => (value) => { calls.push('b'); return fn(value + 1) })
  assert.equal(twice[GATED], true)
  assert.equal(twice(1), 2)
  assert.deepEqual(calls, ['b', 'orig:2'])
})
