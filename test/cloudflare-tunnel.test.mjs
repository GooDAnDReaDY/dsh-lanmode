import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CloudflareTunnel, isCloudflareRequest } from '../lib/tunnel.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Блок 8: #46 & #47 Драйвер CloudflareTunnel и парсинг trycloudflare.com', () => {
  const tunnel = new CloudflareTunnel({ port: 3088, mode: 'quick' })
  assert.equal(tunnel.status, 'stopped')
  assert.equal(tunnel.publicUrl, null)

  const sampleLog = '2026-09-03T12:00:00Z INF +--------------------------------------------------------------------------------------------+\n'
    + '2026-09-03T12:00:00Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |\n'
    + '2026-09-03T12:00:00Z INF |  https://orange-apples-banana.trycloudflare.com                                                |\n'
    + '2026-09-03T12:00:00Z INF +--------------------------------------------------------------------------------------------+'

  const match = sampleLog.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/)
  assert.ok(match, 'должен успешно находиться публичный URL')
  assert.equal(match[0], 'https://orange-apples-banana.trycloudflare.com')
})

test('Блок 8: #48 & #49 Получение состояния и управление туннелем', () => {
  const tunnel = new CloudflareTunnel({ port: 3088 })
  const state = tunnel.getState()
  assert.equal(state.status, 'stopped')
  assert.equal(state.active, false)
  assert.equal(state.publicUrl, null)

  tunnel.stop()
  assert.equal(tunnel.status, 'stopped')
})

test('Блок 8: #50 Детекция входящего трафика Cloudflare WAN (isCloudflareRequest)', () => {
  assert.equal(isCloudflareRequest({ 'cf-ray': '8bd927f8a812-DME' }), true, 'наличие cf-ray означает трафик Cloudflare')
  assert.equal(isCloudflareRequest({ 'cf-connecting-ip': '203.0.113.195' }), true, 'наличие cf-connecting-ip')
  assert.equal(isCloudflareRequest({ 'host': '192.168.77.111:3088' }), false, 'обычный LAN трафик')
})

test('Блок 8: Регистрация эндпоинтов /tunnel и /tunnel/toggle в index.js', () => {
  const indexSource = readFileSync(path.join(here, '..', 'lib', 'index.js'), 'utf8')
  assert.ok(indexSource.includes('/dsh-lanmode/tunnel'), 'должен быть зарегистрирован путь /dsh-lanmode/tunnel')
  assert.ok(indexSource.includes('/dsh-lanmode/tunnel/toggle'), 'должен быть путь /dsh-lanmode/tunnel/toggle')
})
