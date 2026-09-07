import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DeviceRegistry } from '../lib/devices.js'
import { mobileStyles } from '../lib/mobile-styles.js'
import { mobileNavSource } from '../lib/mobile-nav.js'
import { ensurePortAllowed } from '../lib/firewall.js'

test('DeviceRegistry: debounced persistence batches touch calls', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-devices-test-'))
  const filePath = path.join(tmpDir, 'devices.json')

  try {
    let writeCount = 0
    const origWriteFileSync = fs.writeFileSync
    fs.writeFileSync = function (...args) {
      if (args[0] === filePath) writeCount++
      return origWriteFileSync.apply(this, args)
    }

    try {
      const reg = new DeviceRegistry(filePath, { saveDelayMs: 50 })
      assert.equal(writeCount, 0)

      // 10 быстрых вызовов touch
      for (let i = 0; i < 10; i++) {
        reg.touch(`tok-${i}`, {
          headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
          socket: { remoteAddress: `192.168.1.${10 + i}` },
        })
      }

      // В памяти данные появились мгновенно
      assert.equal(reg.devices.size, 10)
      assert.equal(reg.list().length, 10)

      // На диск еще не записано 10 раз
      assert.equal(writeCount, 0, 'writeFileSync не должен вызываться синхронно на каждый touch')

      // Ждем срабатывания таймера дебаунса
      await new Promise((resolve) => setTimeout(resolve, 80))
      assert.equal(writeCount, 1, 'все 10 touch сброшены на диск одним вызовом')

      // Проверяем вызов flush()
      reg.touch('tok-new', {
        headers: { 'user-agent': 'Chrome/120' },
        socket: { remoteAddress: '192.168.1.99' },
      })
      assert.equal(writeCount, 1)
      reg.flush()
      assert.equal(writeCount, 2, 'flush() сбрасывает данные немедленно')

      // Проверяем отзыв устройства
      reg.revoke('tok-0')
      assert.equal(writeCount, 3, 'revoke() инициирует немедленный flush()')
      assert.ok(reg.isRevoked('tok-0'))
    } finally {
      fs.writeFileSync = origWriteFileSync
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('bridge.js: исключение SSE (text/event-stream) из потокового сжатия', () => {
  const bridgeCode = fs.readFileSync(path.join(import.meta.dirname, '..', 'lib', 'bridge.js'), 'utf8')
  assert.ok(bridgeCode.includes('text/event-stream'), 'должен проверять text/event-stream')
  assert.ok(bridgeCode.includes('x-accel-buffering'), 'должен учитывать x-accel-buffering')
  assert.ok(bridgeCode.includes('isSse'), 'должна определяться переменная isSse')
  assert.ok(bridgeCode.includes('!isSse && /json|text|javascript|xml|html/i.test(contentType)'), 'сжатие должно блокироваться для SSE')
})

test('bridge.js: безопасный TCP Keep-Alive без повреждения WebSocket фреймов', () => {
  const bridgeCode = fs.readFileSync(path.join(import.meta.dirname, '..', 'lib', 'bridge.js'), 'utf8')
  assert.ok(bridgeCode.includes('socket.setKeepAlive(true, 25000)'), 'клиентский сокет должен переводиться в TCP keepalive')
  assert.ok(bridgeCode.includes('upstreamSocket.setKeepAlive(true, 25000)'), 'апстрим сокет должен переводиться в TCP keepalive')
  assert.ok(!bridgeCode.includes('0x89, 0x00'), 'не должно быть опасных сырых инъекций пинг-байтов в стрим')
})

test('mobile layer: устранение оверинжиниринга и блокировок UI', () => {
  const navCode = mobileNavSource()
  assert.ok(!navCode.includes('e.stopPropagation()'), 'mobile-nav не должен блокировать Enter в textarea')

  const styles = mobileStyles()
  assert.ok(!styles.includes('[data-dsh-plugin*="terminal"]'), 'mobile-styles не должен скрывать другие плагины')
  assert.ok(!styles.includes('git-graph'), 'mobile-styles не должен скрывать git-graph')

  const shimCode = fs.readFileSync(path.join(import.meta.dirname, '..', 'lib', 'shim.js'), 'utf8')
  assert.ok(!shimCode.includes('HTMLElement.prototype.focus'), 'shim не должен переопределять HTMLElement.prototype.focus')
})

test('client.js: интервалы опроса устройств и туннеля активны только при открытой карточке', () => {
  const clientCode = fs.readFileSync(path.join(import.meta.dirname, '..', 'lib', 'client.js'), 'utf8')
  assert.ok(clientCode.includes('if (!open) return\n        refreshDevices()'), 'refreshDevices должен запускаться только если open == true')
  assert.ok(clientCode.includes('if (!open) return\n        refreshTunnel()'), 'refreshTunnel должен запускаться только если open == true')
})

test('firewall: безопасная обработка непривилегированного запуска', async () => {
  const res = await ensurePortAllowed(9999)
  assert.ok(typeof res === 'object')
  assert.ok('managed' in res)
  assert.ok('open' in res)
  assert.ok('platform' in res)
})