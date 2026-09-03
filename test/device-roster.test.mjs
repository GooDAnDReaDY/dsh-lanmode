import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseUserAgent, DeviceRegistry } from '../lib/devices.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Блок 6: #51 Распознавание User-Agent (iPhone, Android, Windows, Mac)', () => {
  const iphone = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')
  assert.equal(iphone.os, 'iPhone')
  assert.equal(iphone.browser, 'Safari')
  assert.ok(iphone.name.includes('iPhone'))

  const android = parseUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36')
  assert.equal(android.os, 'Android')
  assert.equal(android.browser, 'Chrome')

  const winEdge = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/122.0.0.0')
  assert.equal(winEdge.os, 'Windows')
  assert.equal(winEdge.browser, 'Edge')
})

test('Блок 6: #52 Реестр устройств, онлайн статус и touch', () => {
  const reg = new DeviceRegistry('/tmp/test-devices-1.json')
  reg.touch('tok-1', {
    headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Safari/604.1' },
    socket: { remoteAddress: '192.168.1.55' },
  })

  const list = reg.list()
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 'tok-1')
  assert.equal(list[0].online, true)
  assert.equal(list[0].ip, '192.168.1.55')
  assert.equal(list[0].revoked, false)
})

test('Блок 6: #53 Индивидуальный отзыв устройства (Revoke)', () => {
  const reg = new DeviceRegistry('/tmp/test-devices-2.json')
  reg.touch('tok-2', { headers: {}, socket: {} })
  assert.equal(reg.isRevoked('tok-2'), false)

  reg.revoke('tok-2')
  assert.equal(reg.isRevoked('tok-2'), true)
})

test('Блок 6: #54 Экстренное отключение всех сессий (Emergency Kill Switch)', () => {
  const reg = new DeviceRegistry('/tmp/test-devices-3.json')
  reg.touch('tok-a', { headers: {}, socket: {} })
  reg.touch('tok-b', { headers: {}, socket: {} })

  assert.equal(reg.isRevoked('tok-a'), false)
  assert.equal(reg.isRevoked('tok-b'), false)

  reg.revokeAll()
  assert.equal(reg.isRevoked('tok-a'), true)
  assert.equal(reg.isRevoked('tok-b'), true)
})

test('Блок 6: Регистрация эндпоинтов /devices, /revoke, /kill-all в index.js', () => {
  const indexSource = readFileSync(path.join(here, '..', 'lib', 'index.js'), 'utf8')
  assert.ok(indexSource.includes('/dsh-lanmode/devices'), 'должен быть путь /dsh-lanmode/devices')
  assert.ok(indexSource.includes('/dsh-lanmode/devices/revoke'), 'должен быть путь /revoke')
  assert.ok(indexSource.includes('/dsh-lanmode/devices/kill-all'), 'должен быть путь /kill-all')
})
