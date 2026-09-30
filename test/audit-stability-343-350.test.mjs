import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { EventEmitter } from 'node:events'
import { CloudflareTunnel } from '../lib/tunnel.js'
import { DeviceRegistry } from '../lib/devices.js'
import { BanList, writeBanFile, readBanFile } from '../lib/bans.js'
import { handleUpgrade } from '../lib/bridge-ws.js'
import { mobileNavSource } from '../lib/mobile-nav.js'
import { mobileStyles } from '../lib/mobile-styles.js'
import { readLimitedBody } from '../lib/body-limit.js'
import { resolveSecret, clearSecretCache } from '../lib/secret.js'
import { startMdnsResponder } from '../lib/mdns.js'

test('Issue #343: CloudflareTunnel lifecycle isolation and clean timeout management', async () => {
  const tunnel = new CloudflareTunnel({ port: 3099 })
  assert.equal(tunnel.status, 'stopped')
  assert.equal(tunnel._startTimeout, null)

  // Test stop() while start() is waiting cleans up timeout and marks stopped
  const startPromise = tunnel.start()
  assert.ok(tunnel._startTimeout, 'start() should set _startTimeout')
  assert.equal(tunnel.status, 'starting')

  tunnel.stop()
  assert.equal(tunnel.status, 'stopped')
  assert.equal(tunnel._startTimeout, null)

  // Catch rejection from intentional stop
  await assert.rejects(startPromise, /Tunnel stopped|exited/)

  // Verify import is at the top of lib/tunnel.js
  const tunnelSource = fs.readFileSync(new URL('../lib/tunnel.js', import.meta.url), 'utf8')
  const lines = tunnelSource.split('\n')
  const importIdx = lines.findIndex((l) => l.includes("from './bridge-utils.js'"))
  assert.ok(importIdx >= 0 && importIdx < 20, 'import must be in top 20 lines of lib/tunnel.js')
})

test('Issue #344: DeviceRegistry and BanList use atomic file writes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-lanmode-test-atomic-'))

  try {
    // 1. DeviceRegistry atomic save
    const devFile = path.join(tmpDir, 'devices.json')
    const registry = new DeviceRegistry({ filePath: devFile, saveDelayMs: 0 })
    registry.touch('dev-1', { headers: { 'user-agent': 'Mozilla/5.0' } })
    registry.save()

    assert.ok(fs.existsSync(devFile), 'devices.json must exist')
    const loaded = JSON.parse(fs.readFileSync(devFile, 'utf8'))
    assert.equal(loaded.length, 1)
    assert.equal(loaded[0].id, 'dev-1')

    // 2. BanList atomic write
    const banFile = path.join(tmpDir, 'bans.json')
    const banList = new BanList(['192.168.1.50'])
    writeBanFile(banFile, banList)

    assert.ok(fs.existsSync(banFile), 'bans.json must exist')
    const readBans = readBanFile(banFile)
    assert.ok(readBans.has('192.168.1.50'))
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('Issue #345: handleUpgrade attaches early close listener and safeDestroy upstream', () => {
  class FakeSocket extends EventEmitter {
    constructor() {
      super()
      this.remoteAddress = '192.168.1.20'
      this.destroyed = false
    }
    setTimeout() {}
    setNoDelay() {}
    setKeepAlive() {}
    write() {}
    destroy() {
      this.destroyed = true
      this.emit('close')
    }
  }

  const clientSocket = new FakeSocket()

  const req = {
    method: 'GET',
    url: '/ws',
    headers: { host: 'example.com', upgrade: 'websocket', connection: 'Upgrade' },
  }

  handleUpgrade(req, clientSocket, Buffer.alloc(0), {
    welcome: () => true,
    isPasswordAuth: () => false,
    rewritten: (h) => ({ ...h }),
    authority: '127.0.0.1:3080',
    upstreamPort: 3080,
    safeDestroy: (s) => {
      if (s) {
        if (typeof s.destroy === 'function') s.destroy()
        if (typeof s.abort === 'function') s.abort()
      }
    },
  })

  // Emit client socket close during handshake
  assert.equal(clientSocket.listenerCount('close'), 1, 'socket must have early close listener')
  clientSocket.emit('close')
})

test('Issue #346: mobileNavSource has idempotency guard and no hardcoded colors', () => {
  const code = mobileNavSource()
  assert.ok(
    code.includes('window.__dsh_lanmode_mobile_nav_installed'),
    'must contain window.__dsh_lanmode_mobile_nav_installed guard',
  )
  assert.equal(code.includes('#6366f1'), false, 'must not contain #6366f1')
  assert.equal(code.includes('#fff)'), false, 'must not contain #fff')
  assert.ok(code.includes('window.__dsh_lanmode_clear_fab'), 'must expose fab clear helper')
})

test('Issue #347: readLimitedBody settles on early socket close', async () => {
  class FakeReq extends EventEmitter {
    constructor() {
      super()
      this.readableEnded = false
    }
    pause() {}
    destroy() {}
  }

  const req = new FakeReq()
  const promise = readLimitedBody(req, 1024)

  req.emit('data', Buffer.from('partial'))
  req.emit('close')

  const result = await promise
  assert.deepEqual(result, { ok: false }, 'must resolve { ok: false } when socket closes early')
})

test('Issue #348: mobileStyles uses theme tokens without raw hardcoded rgba fallbacks', () => {
  const styles = mobileStyles()
  assert.equal(
    styles.includes('rgba(255, 255, 255, 0.85)'),
    false,
    'must not contain raw rgba(255, 255, 255, 0.85)',
  )
  assert.equal(
    styles.includes('rgba(0, 0, 0, 0.08)'),
    false,
    'must not contain raw rgba(0, 0, 0, 0.08)',
  )
})

test('Issue #349: clearSecretCache clears cached credentials', async () => {
  clearSecretCache()
  const mockCtx = {
    credentials: {
      resolve: async () => ({ value: 'secret-val-1' }),
    },
  }

  const val1 = await resolveSecret(mockCtx, 'TEST_CRED_KEY', 'fallback')
  assert.equal(val1, 'secret-val-1')

  // Change underlying provider - should hit cache
  mockCtx.credentials.resolve = async () => ({ value: 'secret-val-2' })
  const cachedVal = await resolveSecret(mockCtx, 'TEST_CRED_KEY', 'fallback')
  assert.equal(cachedVal, 'secret-val-1', 'must return cached secret')

  // Clear cache - should fetch new value
  clearSecretCache()
  const freshVal = await resolveSecret(mockCtx, 'TEST_CRED_KEY', 'fallback')
  assert.equal(freshVal, 'secret-val-2', 'must return fresh secret after clearSecretCache()')

  const indexSource = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.ok(
    indexSource.includes('clearSecretCache'),
    'lib/index.js must export and call clearSecretCache on dispose',
  )
})

test('Issue #350: startMdnsResponder handles socket error safely without throwing', () => {
  let logMsg = ''
  const stop = startMdnsResponder({
    name: 'dsh.local',
    port: 3088,
    addresses: ['192.168.1.111'],
    log: (m) => { logMsg += m },
  })

  assert.equal(typeof stop, 'function')
  // Calling stop twice must not throw ERR_SOCKET_DGRAM_NOT_RUNNING
  assert.doesNotThrow(() => {
    stop()
    stop()
  })
})
