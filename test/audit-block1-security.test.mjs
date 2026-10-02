import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { once } from 'node:events'
import { apply } from '../lib/index.js'
import { AuthManager } from '../lib/auth.js'
import { startDirectBridge } from '../lib/bridge.js'
import { parseAllow } from '../lib/access.js'
import { BanList } from '../lib/bans.js'
import { registerConfigApi } from '../lib/routes/config.js'
import { resolveSecret, clearSecretCache, makeCredentialRef } from '../lib/secret.js'
import { ensureCertificate } from '../lib/tls.js'
import { DeviceRegistry } from '../lib/devices.js'

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  s.listen(0, '127.0.0.1')
  await once(s, 'listening')
  const p = s.address().port
  await new Promise((r) => s.close(r))
  return p
}

test('Issue #354: TLS files mode loads without ReferenceError in raiseListener', async () => {
  const certdir = path.join(os.tmpdir(), `dsh-cert-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await ensureCertificate({ dir: certdir, hosts: ['localhost', '127.0.0.1'], log() {} })
  const port = await freePort()
  const upstream = http.createServer((q, s) => s.end('OK'))
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')

  const logs = []
  const cleanups = []
  const ctx = {
    webServer: { port: upstream.address().port, register() { return () => {} }, tapIndex() { return () => {} } },
    logger: { info(x) { logs.push(x) }, warn(x) { logs.push(x) }, debug() {} },
    get() { return undefined },
    inject() { return () => {} },
    effect(fn) {
      const c = fn()
      if (typeof c === 'function') cleanups.push(c)
    },
  }

  try {
    apply(ctx, {
      mode: 'direct',
      directHost: '127.0.0.1',
      directPort: port,
      tls: 'files',
      tlsCert: path.join(certdir, 'lanmode-cert.pem'),
      tlsKey: path.join(certdir, 'lanmode-key.pem'),
      allow: ['127.0.0.0/8'],
      mdns: false,
    })
    await delay(150)
    // Check logs for ReferenceError: effective is not defined
    const hasRefError = logs.some((l) => String(l).includes('ReferenceError') || String(l).includes('effective is not defined'))
    assert.equal(hasRefError, false, 'Must not throw ReferenceError: effective is not defined')
  } finally {
    for (const c of cleanups.reverse()) await c()
    upstream.closeAllConnections()
    await new Promise((r) => upstream.close(r))
    try { fs.rmSync(certdir, { recursive: true, force: true }) } catch {}
  }
})

test('Issue #360: Fail-closed guard refuses to bind 0.0.0.0 without allow or passwordAuth', async () => {
  const port = await freePort()
  const upstream = http.createServer((q, s) => s.end('OK'))
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')

  const logs = []
  const cleanups = []
  const ctx = {
    webServer: { port: upstream.address().port, register() { return () => {} }, tapIndex() { return () => {} } },
    logger: { info(x) { logs.push(x) }, warn(x) { logs.push(x) }, debug() {} },
    get() { return undefined },
    inject() { return () => {} },
    effect(fn) {
      const c = fn()
      if (typeof c === 'function') cleanups.push(c)
    },
  }

  try {
    apply(ctx, {
      mode: 'direct',
      directHost: '0.0.0.0',
      directPort: port,
      allow: [],
      passwordAuth: false,
      mdns: false,
    })
    await delay(150)

    let connected = false
    try {
      await fetch(`http://127.0.0.1:${port}/audit`, { signal: AbortSignal.timeout(500) })
      connected = true
    } catch {
      connected = false
    }

    assert.equal(connected, false, 'Port must NOT be open when 0.0.0.0 is used without allowlist or passwordAuth')
  } finally {
    for (const c of cleanups.reverse()) await c()
    upstream.closeAllConnections()
    await new Promise((r) => upstream.close(r))
  }
})

test('Issue #361: Unresolved credential ref returns fallback/empty, not ref identifier', async () => {
  clearSecretCache()
  const mockCtx = { get() { return undefined } }
  const val = await resolveSecret(mockCtx, 'AUDIT_ABSENT_CREDENTIAL_20260930', 'safe-fallback')
  assert.equal(val, 'safe-fallback')

  clearSecretCache()
  const secretCalls = []
  const serviceCtx = {
    get() {
      return {
        resolve: async (r) => {
          secretCalls.push(typeof r)
          return typeof r === 'string' ? { value: 'resolved-secret' } : undefined
        },
      }
    },
  }
  const resolved = await resolveSecret(serviceCtx, 'MY_REF')
  assert.equal(resolved, 'resolved-secret')
  assert.deepEqual(secretCalls, ['string'])
})

test('Issue #362: Masked password *** does not overwrite real password in PATCH config', async () => {
  const routes = new Map()
  const auth = new AuthManager()
  const effective = {
    passwordAuth: true,
    authUser: 'admin',
    authPassword: 'audit-original',
    allow: ['127.0.0.0/8'],
    directPort: 3088,
  }
  const session = auth.createSession('admin', { socket: { remoteAddress: '127.0.0.1' }, headers: {} })
  const state = {
    authManager: auth,
    rules: parseAllow(effective.allow).rules,
    adminRules: [],
    guestRules: [],
  }

  registerConfigApi({
    webServer: { register(x) { routes.set(x.path, x.handler); return () => {} } },
    effect(fn) { return fn() },
  }, effective, () => {}, { state })

  async function configCall(method, payload) {
    const { EventEmitter } = await import('node:events')
    const req = new EventEmitter()
    Object.assign(req, {
      method,
      url: '/dsh-lanmode/api/config',
      headers: { host: 'localhost', authorization: 'Bearer ' + session.token },
      socket: { remoteAddress: '127.0.0.1' },
    })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('timeout')), 2000)
      const res = {
        writeHead(status, headers) { this.status = status; this.headers = headers },
        end(body) {
          clearTimeout(timer)
          resolve({ status: this.status, body: JSON.parse(body) })
        },
      }
      routes.get('/dsh-lanmode/api/config')(req, res)
      if (method === 'PATCH') {
        queueMicrotask(() => {
          req.emit('data', Buffer.from(JSON.stringify(payload)))
          req.emit('end')
        })
      }
    })
  }

  const initial = await configCall('GET')
  assert.equal(initial.body.value.authPassword, '***')

  // Client sends back mask *** on saving settings
  const roundTrip = await configCall('PATCH', {
    authPassword: initial.body.value.authPassword,
    mdns: false,
  })
  assert.equal(roundTrip.status, 200)
  assert.equal(effective.authPassword, 'audit-original', 'Password must retain original value')
  assert.ok(auth.verifyCredentials('admin', 'audit-original', 'admin', effective.authPassword))
  assert.equal(auth.verifyCredentials('admin', '***', 'admin', effective.authPassword), false)
  auth.destroy()
})

test('Issue #366: LAN PIN protects config PATCH and cannot be bypassed', async () => {
  const routes = new Map()
  const effective = {
    passwordAuth: false,
    lanPin: '87654321',
    allow: ['127.0.0.0/8', '198.51.100.0/24'],
    trustedProxyCidrs: ['127.0.0.0/8'],
    directPort: 3088,
  }
  const state = {
    lanPin: true,
    rules: parseAllow(effective.allow).rules,
    adminRules: [],
    guestRules: [],
  }

  registerConfigApi({
    webServer: { register(x) { routes.set(x.path, x.handler); return () => {} } },
    effect(fn) { return fn() },
  }, effective, () => {}, { state })

  const { EventEmitter } = await import('node:events')
  function patchReq(headers, body) {
    const req = new EventEmitter()
    Object.assign(req, {
      method: 'PATCH',
      url: '/dsh-lanmode/api/config',
      headers: { host: 'localhost', ...headers },
      socket: { remoteAddress: '127.0.0.1' },
    })
    return new Promise((resolve) => {
      const res = {
        writeHead(status, headers) { this.status = status; this.headers = headers },
        end(body) { resolve({ status: this.status, headers: this.headers, body: JSON.parse(body || '{}') }) },
      }
      routes.get('/dsh-lanmode/api/config')(req, res)
      queueMicrotask(() => {
        req.emit('data', Buffer.from(JSON.stringify(body)))
        req.emit('end')
      })
    })
  }

  // Without PIN: must be rejected with 403
  const noPin = await patchReq({ 'x-forwarded-for': '198.51.100.45' }, { mdns: false })
  assert.equal(noPin.status, 403, 'PATCH config without PIN must return 403')

  // With correct PIN: accepted
  const withPin = await patchReq({ 'x-forwarded-for': '198.51.100.45', 'x-dsh-lan-pin': '87654321' }, { mdns: false })
  assert.equal(withPin.status, 200, 'PATCH config with valid PIN must succeed')
})

test('Issue #238: Remote caller cannot access /auth/bootstrap through bridge', async () => {
  const port = await freePort()
  const upstream = http.createServer((q, s) => {
    if (q.url === '/auth/bootstrap') s.end('BOOTSTRAP_GRANTED')
    else s.end('UPSTREAM')
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')

  const stop = startDirectBridge({ webServer: { port: upstream.address().port } }, {
    port,
    hosts: ['127.0.0.1'],
    allow: ['127.0.0.0/8', '198.51.100.0/24'],
    trustedProxyCidrs: ['127.0.0.0/8'],
    passwordAuth: false,
    log() {},
  })
  await delay(50)

  try {
    // Loopback call succeeds
    const local = await fetch(`http://127.0.0.1:${port}/auth/bootstrap`, { signal: AbortSignal.timeout(1000) })
    assert.equal(local.status, 200)

    // Remote call via trusted proxy is rejected with 403
    const remote = await fetch(`http://127.0.0.1:${port}/auth/bootstrap`, {
      headers: { 'x-forwarded-for': '198.51.100.50' },
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(remote.status, 403, 'Remote caller to /auth/bootstrap must receive 403')
  } finally {
    await stop()
    upstream.closeAllConnections()
    await new Promise((r) => upstream.close(r))
  }
})

test('Issue #367: WebSocket upgrade enforces ban, guest restrictions, PIN and origin', async () => {
  const port = await freePort()
  const upstream = http.createServer((q, s) => s.end('UPSTREAM'))
  upstream.on('upgrade', (q, s) => {
    s.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
    setTimeout(() => s.destroy(), 20)
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')

  const banList = new BanList(['198.51.100.44'])
  const stop = startDirectBridge({ webServer: { port: upstream.address().port } }, {
    port,
    hosts: ['127.0.0.1'],
    allow: ['127.0.0.0/8', '198.51.100.0/24'],
    guestAllow: ['198.51.100.0/24'],
    trustedProxyCidrs: ['127.0.0.0/8'],
    lanPin: '12345678',
    unlockPrivileged: false,
    passwordAuth: false,
    banList,
    log() {},
  })
  await delay(50)

  async function wsStatus(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const s = net.connect(port, '127.0.0.1')
      let data = ''
      s.setTimeout(1500, () => { s.destroy(); reject(Error('ws timeout')) })
      s.on('connect', () => {
        s.write('GET ' + url + ' HTTP/1.1\r\nHost: localhost:' + port + '\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n' +
          Object.entries(headers).map(([k, v]) => k + ': ' + v + '\r\n').join('') + '\r\n')
      })
      s.on('data', (b) => {
        data += b.toString()
        if (data.includes('\r\n')) {
          resolve(Number(data.split(' ')[1]))
          s.destroy()
        }
      })
      s.on('error', reject)
    })
  }

  try {
    // 1. Banned IP must NOT upgrade (403)
    const wsBanned = await wsStatus('/api/settings.list', { 'x-forwarded-for': '198.51.100.44' })
    assert.equal(wsBanned, 403, 'Banned IP must be rejected on WS upgrade')

    // 2. Untrusted Origin must NOT upgrade (403)
    const wsOrigin = await wsStatus('/api/settings.list', { Origin: 'https://attacker.invalid' })
    assert.equal(wsOrigin, 403, 'Untrusted Origin must be rejected on WS upgrade')

    // 3. Guest IP requesting privileged endpoint must NOT upgrade (403)
    const wsGuest = await wsStatus('/api/settings.describe', { 'x-forwarded-for': '198.51.100.45' })
    assert.equal(wsGuest, 403, 'Guest accessing privileged endpoint must be rejected on WS upgrade')

    // 4. Locked privileged call without PIN must NOT upgrade (403)
    const wsLocked = await wsStatus('/api/settings.describe')
    assert.equal(wsLocked, 403, 'Privileged locked call without PIN must be rejected on WS upgrade')
  } finally {
    await stop()
    upstream.closeAllConnections()
    await new Promise((r) => upstream.close(r))
  }
})

test('Issue #368: Public /dsh-lanmode/qr does not leak core token to unauthenticated clients', async () => {
  const port = await freePort()
  const upstream = http.createServer((q, s) => s.end('UPSTREAM'))
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')

  const stop = startDirectBridge({ webServer: { port: upstream.address().port } }, {
    port,
    hosts: ['127.0.0.1'],
    allow: ['127.0.0.0/8'],
    passwordAuth: true,
    token: 'AUDIT_CORE_TOKEN_SECRET',
    log() {},
  })
  await delay(50)

  try {
    const res = await fetch(`http://127.0.0.1:${port}/dsh-lanmode/qr`)
    assert.equal(res.status, 200)
    const svg = await res.text()
    // Must not contain core token in the QR SVG
    assert.equal(svg.includes('AUDIT_CORE_TOKEN_SECRET'), false, 'Public QR must not contain core token')
  } finally {
    await stop()
    upstream.closeAllConnections()
    await new Promise((r) => upstream.close(r))
  }
})

test('Issue #266 & #369: DeviceRegistry stores hashes, handles save failure, and never evicts revocations', async () => {
  const tmpFile = path.join(os.tmpdir(), `dsh-audit-cap-${Date.now()}.json`)
  try {
    const cap = new DeviceRegistry(tmpFile)
    cap.touch('AUDIT_REVOKED', { socket: { remoteAddress: '127.0.0.1' }, headers: {} })
    cap.revoke('AUDIT_REVOKED')
    assert.equal(cap.isRevoked('AUDIT_REVOKED'), true)

    // Touch 201 devices to trigger LRU eviction limit of 200
    for (let i = 0; i < 201; i++) {
      cap.touch('AUDIT_DEVICE_' + i, { socket: { remoteAddress: '127.0.0.1' }, headers: {} })
    }

    // Revocation MUST still be active despite 201 touches! (#369)
    assert.equal(cap.isRevoked('AUDIT_REVOKED'), true, 'Revocation must not be evicted by 200-device LRU')
    cap.flush()

    // File on disk must NOT contain raw token string (#266)
    const diskContent = fs.readFileSync(tmpFile, 'utf8')
    assert.equal(diskContent.includes('AUDIT_DEVICE_0'), false, 'Disk storage must contain digests, not raw tokens')

    // Mode must be 0600
    const mode = fs.statSync(tmpFile).mode & 0o777
    assert.equal(mode.toString(8), '600', 'Devices file must have 0600 permissions')

    // Test write failure handling
    const notDir = path.join(os.tmpdir(), `dsh-not-dir-${Date.now()}`)
    fs.writeFileSync(notDir, 'x')
    const bad = new DeviceRegistry(path.join(notDir, 'devices.json'))
    bad.touch('AUDIT', { socket: { remoteAddress: '127.0.0.1' }, headers: {} })
    const revokeOk = bad.revoke('AUDIT')
    assert.equal(revokeOk, false, 'Revoke must report failure when disk write fails')
    assert.equal(bad._isDirty, true, 'Dirty flag must remain true on write failure')
    fs.unlinkSync(notDir)
  } finally {
    try { fs.unlinkSync(tmpFile) } catch {}
  }
})

test('Issue #54: Session revocation terminates active WebSockets immediately', async () => {
  const port = await freePort()
  const echoSockets = new Set()
  const echo = http.createServer((q, s) => s.end('UPSTREAM'))
  echo.on('connection', (s) => {
    echoSockets.add(s)
    s.on('close', () => echoSockets.delete(s))
  })
  echo.on('upgrade', (q, s) => {
    echoSockets.add(s)
    s.on('close', () => echoSockets.delete(s))
    s.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
    s.on('data', (b) => s.write(b))
  })
  echo.listen(0, '127.0.0.1')
  await once(echo, 'listening')

  const registry = new DeviceRegistry(path.join(os.tmpdir(), `dsh-dev-rev-${Date.now()}.json`))
  const auth = new AuthManager({ deviceRegistry: registry })
  const sess = auth.createSession('admin', { socket: { remoteAddress: '127.0.0.1' }, headers: {} })

  const stop = startDirectBridge({ webServer: { port: echo.address().port } }, {
    port,
    hosts: ['127.0.0.1'],
    allow: ['127.0.0.0/8'],
    passwordAuth: true,
    authManager: auth,
    deviceRegistry: registry,
    token: 'AUDIT_CORE_TOKEN',
    log() {},
  })
  await delay(60)

  try {
    const socket = net.connect(port, '127.0.0.1')
    await once(socket, 'connect')
    socket.write(`GET /ws HTTP/1.1\r\nHost: localhost:${port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nAuthorization: Bearer ${sess.token}\r\nOrigin: http://localhost:${port}\r\n\r\n`)
    const [handshake] = await once(socket, 'data')
    assert.equal(Number(handshake.toString().split(' ')[1]), 101)

    // Revoke the session
    auth.revokeSession(sess.token)

    // Socket should be closed/destroyed by bridge. Sending data should trigger close/error, not echo
    let closed = false
    socket.on('close', () => { closed = true })
    socket.on('error', () => { closed = true })
    socket.write('TRAFFIC_AFTER_REVOKE')
    await delay(100)

    assert.equal(closed || socket.destroyed, true, 'WebSocket socket must be closed immediately upon session revocation')
  } finally {
    await stop()
    auth.destroy()
    for (const s of echoSockets) s.destroy()
    if (typeof echo.closeAllConnections === 'function') echo.closeAllConnections()
    await new Promise((r) => {
      echo.close(r)
      setTimeout(r, 100)
    })
    try { fs.unlinkSync(registry.filePath) } catch {}
  }
})
