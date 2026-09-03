import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import zlib from 'node:zlib'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Блок 4: #64 Потоковая компрессия Brotli и Gzip в bridge.js', () => {
  const bridge = readFileSync(path.join(here, '..', 'lib', 'bridge.js'), 'utf8')
  assert.ok(bridge.includes('createBrotliCompress'), 'должна поддерживаться компрессия brotli')
  assert.ok(bridge.includes('createGzip'), 'должна поддерживаться компрессия gzip')
  assert.ok(bridge.includes('content-encoding'), 'должен выставляться заголовок content-encoding')
})

test('Блок 4: #65 WebSocket Heartbeat ping/pong в bridge.js', () => {
  const bridge = readFileSync(path.join(here, '..', 'lib', 'bridge.js'), 'utf8')
  assert.ok(bridge.includes('0x89, 0x00'), 'должен отправляться RFC 6455 Ping-кадр [0x89, 0x00]')
  assert.ok(bridge.includes('setInterval'), 'должен быть таймер heartbeat')
  assert.ok(bridge.includes('25000'), 'интервал должен составлять 25 секунд')
})

test('Блок 4: #66 Быстрое авто-переподключение WebSocket при возврате во вкладку', () => {
  const client = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')
  assert.ok(client.includes('visibilitychange'), 'должно обрабатываться событие visibilitychange')
  assert.ok(client.includes('dsh-lanmode-reconnect'), 'должен диспетчеризоваться эвент реконнекта')
})

test('Блок 4: #67 Индикатор задержки сети и RTT пинга в клиенте', () => {
  const client = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')
  assert.ok(client.includes('rtt'), 'должно отслеживаться состояние rtt')
  assert.ok(client.includes('performance.now()'), 'должен замеряться round-trip time через performance.now()')
  assert.ok(client.includes('Пинг:'), 'должен отображаться пинг в UI')
})
