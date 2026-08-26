import assert from 'node:assert/strict'
import test from 'node:test'

import { forceLoopback, isConnectionBundle } from '../lib/loopback-source.js'

test('путь узнаётся вместе со строкой запроса', () => {
  assert.equal(isConnectionBundle('/plugins/@deepseek-ai/dsh-client-connection/client.js'), true)
  assert.equal(isConnectionBundle('/plugins/@deepseek-ai/dsh-client-connection/client.js?rev=abc123'), true)
  assert.equal(isConnectionBundle('/plugins/@deepseek-ai/dsh-client-ui-settings/client.js'), false)
  assert.equal(isConnectionBundle(undefined), false)
})

test('вычисление заменяется на «да»', () => {
  const before = 'const handle = { api, isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname), hostDescription: d }'
  const after = forceLoopback(before)
  assert.equal(after.changed, true)
  assert.match(after.source, /isLoopback: true,/)
  assert.equal(after.source.includes('isLoopbackHostname(pageLocation.hostname)'), false)
  assert.match(after.source, /hostDescription: d/, 'остальное не тронуто')
})

test('нет вычисления — нет и правки', () => {
  const untouched = 'export function nothing() { return 1 }'
  const after = forceLoopback(untouched)
  assert.equal(after.changed, false)
  assert.equal(after.source, untouched)
})
