import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const bridge = readFileSync(path.join(here, '..', 'lib', 'bridge.js'), 'utf8')
const ws = readFileSync(path.join(here, '..', 'lib', 'bridge-ws.js'), 'utf8')

test('Issue #264: HTTP responses are piped without full-body buffering', () => {
  assert.ok(bridge.includes('answer.pipe(res)'))
  assert.ok(bridge.includes('answer.pipe(stream).pipe(res)'))
  assert.ok(bridge.includes('req.pipe(upstream)'))
  assert.ok(bridge.includes('text/event-stream'))
  assert.ok(bridge.includes('Dedicated unpooled agent for long-lived streaming'))
})

test('Issue #264: WebSocket upgrades pipe sockets directly', () => {
  assert.ok(/\.pipe\(/.test(ws) || ws.includes('.pipe('))
  assert.ok(ws.includes('upgrade') || ws.includes('Upgrade'))
})
