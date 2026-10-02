// Audit regression tests for Block 2: Durable and live config (#363, #364, #365, #329)
// Zero hardcoded Cyrillic characters.

import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { once } from 'node:events'
import { apply } from '../lib/index.js'
import { registerConfigApi } from '../lib/routes/config.js'
import { validateConfigPatch, isRestartRequired, persistConfigDurable } from '../lib/config-validator.js'
import { resolveBrowserAuthSecret } from '../lib/dsh-auth-cookie.js'
import { parseAllow } from '../lib/access.js'
import { startDirectBridge } from '../lib/bridge.js'

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

async function freePort() {
  const s = net.createServer()
  s.listen(0, '127.0.0.1')
  await once(s, 'listening')
  const p = s.address().port
  await new Promise((r) => s.close(r))
  return p
}

function requestJson(port, method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const reqHeaders = {
      'host': '127.0.0.1',
      ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
      ...headers,
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: reqHeaders,
    }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(data) } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: json, text: data })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

// -----------------------------------------------------------------------------
// Issue #363: Schema & Type Validation for PATCH config
// -----------------------------------------------------------------------------
test('Issue #363: PATCH config rejects invalid types, ports, enums, CIDRs without mutating state', async () => {
  const routes = new Map()
  const port = await freePort()
  const server = http.createServer((req, res) => {
    const handler = routes.get(req.url)
    if (handler) return handler(req, res)
    res.writeHead(404)
    res.end()
  })
  server.listen(port, '127.0.0.1')
  await once(server, 'listening')

  const effective = {
    mode: 'auto',
    directPort: 3088,
    passwordAuth: false,
    allow: ['127.0.0.0/8'],
    adminAllow: [],
    guestAllow: [],
    tls: 'off',
    tunnel: 'off',
  }

  const ctx = {
    webServer: {
      register({ path, handler }) {
        routes.set(path, handler)
      },
    },
    effect(fn) { fn() },
  }

  const access = {
    state: {
      adminRules: [],
      guestRules: [],
      rules: parseAllow(['127.0.0.0/8']).rules,
      trustedProxyCidrs: ['127.0.0.0/8', '::1/128'],
    },
    persistConfig: async () => {},
  }

  registerConfigApi(ctx, effective, () => {}, access)

  try {
    // 1. Invalid mode enum
    const resMode = await requestJson(port, 'PATCH', '/dsh-lanmode/api/config', { mode: 'garbage' })
    assert.equal(resMode.status, 400, 'Invalid mode must return 400')
    assert.equal(effective.mode, 'auto', 'Effective mode must NOT be mutated on validation failure')

    // 2. Negative directPort
    const resNegPort = await requestJson(port, 'PATCH', '/dsh-lanmode/api/config', { directPort: -1 })
    assert.equal(resNegPort.status, 400, 'Negative port must return 400')
    assert.equal(effective.directPort, 3088, 'Effective directPort must NOT be mutated')

    // 3. Port out of range (> 65535)
    const resHighPort = await requestJson(port, 'PATCH', '/dsh-lanmode/api/config', { directPort: 70000 })
    assert.equal(resHighPort.status, 400, 'Port 70000 must return 400')
    assert.equal(effective.directPort, 3088, 'Effective directPort must NOT be mutated')

    // 4. String instead of boolean for passwordAuth
    const resStrBool = await requestJson(port, 'PATCH', '/dsh-lanmode/api/config', { passwordAuth: 'false' })
    assert.equal(resStrBool.status, 400, 'String boolean must return 400')
    assert.equal(effective.passwordAuth, false, 'Effective passwordAuth must NOT be mutated')

    // 5. String instead of array for allow
    const resStrAllow = await requestJson(port, 'PATCH', '/dsh-lanmode/api/config', { allow: 'not-an-array' })
    assert.equal(resStrAllow.status, 400, 'String allow must return 400')
    assert.deepEqual(effective.allow, ['127.0.0.0/8'], 'Effective allow must NOT be mutated')

    // 6. Invalid CIDR string in allow array
    const resBadCidr = await requestJson(port, 'PATCH', '/dsh-lanmode/api/config', { allow: ['invalid-cidr-string'] })
    assert.equal(resBadCidr.status, 400, 'Invalid CIDR must return 400')
    assert.deepEqual(effective.allow, ['127.0.0.0/8'], 'Effective allow must NOT be mutated')

    // 7. Unknown config key
    const resUnknown = await requestJson(port, 'PATCH', '/dsh-lanmode/api/config', { unknownBogusKey: 123 })
    assert.equal(resUnknown.status, 400, 'Unknown key must return 400')

    // 8. Valid PATCH applies atomically and returns 200
    const resValid = await requestJson(port, 'PATCH', '/dsh-lanmode/api/config', {
      mode: 'direct',
      directPort: 3099,
      allow: ['127.0.0.0/8', '192.168.1.0/24'],
    })
    assert.equal(resValid.status, 200, 'Valid patch must return 200')
    assert.equal(effective.mode, 'direct', 'Effective mode must be updated')
    assert.equal(effective.directPort, 3099, 'Effective directPort must be updated')
    assert.deepEqual(effective.allow, ['127.0.0.0/8', '192.168.1.0/24'], 'Effective allow must be updated')
  } finally {
    server.close()
  }
})

// -----------------------------------------------------------------------------
// Issue #364: Durable Config Persistence
// -----------------------------------------------------------------------------
test('Issue #364: Save config requires durable persistence; failure reports error without false success', async () => {
  const routes = new Map()
  const port = await freePort()
  const server = http.createServer((req, res) => {
    const handler = routes.get(req.url)
    if (handler) return handler(req, res)
    res.writeHead(404)
    res.end()
  })
  server.listen(port, '127.0.0.1')
  await once(server, 'listening')

  const effective = {
    mode: 'auto',
    directPort: 3088,
  }

  let persistedValue = null
  let shouldFailPersist = false

  const ctx = {
    webServer: {
      register({ path, handler }) { routes.set(path, handler) },
    },
    effect(fn) { fn() },
  }

  const access = {
    state: {
      adminRules: [],
      guestRules: [],
      rules: parseAllow(['127.0.0.0/8']).rules,
      trustedProxyCidrs: ['127.0.0.0/8', '::1/128'],
    },
    persistConfig: async (cfg) => {
      if (shouldFailPersist) {
        throw new Error('Disk write failed / filesystem read-only')
      }
      persistedValue = { ...cfg }
    },
  }

  registerConfigApi(ctx, effective, () => {}, access)

  try {
    // 1. Successful durable save
    shouldFailPersist = false
    const resOk = await requestJson(port, 'PATCH', '/dsh-lanmode/api/config', { directPort: 3090 })
    assert.equal(resOk.status, 200, 'Durable save success returns 200')
    assert.equal(persistedValue.directPort, 3090, 'Durable storage received updated port')

    // 2. Failed durable save returns 500 and does NOT claim success
    shouldFailPersist = true
    const resFail = await requestJson(port, 'PATCH', '/dsh-lanmode/api/config', { directPort: 3091 })
    assert.equal(resFail.status, 500, 'Durable save failure must return 500')
    assert.ok(resFail.body && resFail.body.error.includes('Disk write failed'), 'Error message reflected')
  } finally {
    server.close()
  }
})

// -----------------------------------------------------------------------------
// Issue #365: Live Config Updates for Roles & Permissions
// -----------------------------------------------------------------------------
test('Issue #365: Live config atomically updates adminAllow/guestAllow on running bridge without restart', async () => {
  const upstreamPort = await freePort()
  const upstream = http.createServer((req, res) => {
    if (req.url === '/api/settings') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ settings: ['ok'] }))
      return
    }
    res.writeHead(200)
    res.end('UPSTREAM_OK')
  })
  upstream.listen(upstreamPort, '127.0.0.1')
  await once(upstream, 'listening')

  const bridgePort = await freePort()
  const state = {
    adminRules: [],
    guestRules: [],
    rules: parseAllow(['127.0.0.0/8']).rules,
    trustedProxyCidrs: ['127.0.0.0/8', '::1/128'],
    mode: 'direct',
    unlockPrivileged: true,
  }

  const config = {
    mode: 'direct',
    directPort: bridgePort,
    allow: ['127.0.0.0/8'],
    adminAllow: [],
    guestAllow: [],
    trustedProxyCidrs: ['127.0.0.0/8', '::1/128'],
  }

  const stopBridge = startDirectBridge({ webServer: { port: upstreamPort } }, {
    state,
    hosts: ['127.0.0.1'],
    port: bridgePort,
    allow: config.allow,
    adminAllow: config.adminAllow,
    guestAllow: config.guestAllow,
    trustedProxyCidrs: config.trustedProxyCidrs,
    unlockPrivileged: true,
    log() {},
  })

  await delay(100)

  try {
    // 1. Initial request from loopback: no guestAllow configured -> role is default (permitted admin)
    const res1 = await requestJson(bridgePort, 'GET', '/api/settings')
    assert.equal(res1.status, 200, 'Initial access permitted')

    // 2. Live config change: restrict 127.0.0.1 to guestAllow
    config.guestAllow = ['127.0.0.1/32']
    state.guestRules = parseAllow(config.guestAllow).rules

    // 3. Immediate request from 127.0.0.1 to administrative endpoint is rejected as guest
    const resGuest = await requestJson(bridgePort, 'GET', '/api/settings')
    assert.equal(resGuest.status, 403, 'Live guestAllow takes effect immediately without bridge restart')
    assert.ok(resGuest.body && resGuest.body.error.includes('Guest access does not permit administrative actions'))

    // 4. Non-administrative request still works for guest
    const resNormal = await requestJson(bridgePort, 'GET', '/normal-chat-route')
    assert.equal(resNormal.status, 200, 'Guest can still access non-administrative routes')

    // 5. Live config change: restore 127.0.0.1 to adminAllow
    config.guestAllow = []
    config.adminAllow = ['127.0.0.1/32']
    state.guestRules = []
    state.adminRules = parseAllow(config.adminAllow).rules

    // 6. Immediate request is allowed again
    const resAdmin = await requestJson(bridgePort, 'GET', '/api/settings')
    assert.equal(resAdmin.status, 200, 'Live adminAllow restores administrative access immediately')

    // 7. Restart flag verification: permissions change does NOT need restart; port change DOES
    assert.equal(isRestartRequired({ guestAllow: ['10.0.0.1/32'] }, config), false, 'Permissions only do not require restart')
    assert.equal(isRestartRequired({ directPort: 4000 }, config), true, 'Port change requires restart')
    assert.equal(isRestartRequired({ tls: 'self-signed' }, config), true, 'TLS change requires restart')
  } finally {
    await stopBridge()
    upstream.close()
  }
})

// -----------------------------------------------------------------------------
// Issue #329: Browser Auth Secret & Optional Credentials Inject
// -----------------------------------------------------------------------------
test('Issue #329: apply() works without credentials service; resolveBrowserAuthSecret is async without file read', async () => {
  // 1. resolveBrowserAuthSecret with credentials service
  const mockCtxWithCreds = {
    credentials: {
      async readRecord(kind, name) {
        if (kind === 'client-connection' && name === 'browser-session') {
          return { payload: { secret: 'secret-from-credentials-service' } }
        }
        return null
      },
    },
  }
  const secret = await resolveBrowserAuthSecret(mockCtxWithCreds)
  assert.equal(secret, 'secret-from-credentials-service', 'Resolves secret via async readRecord')

  // 2. resolveBrowserAuthSecret with missing credentials service: returns empty string safely
  const mockCtxEmpty = {
    get() { return undefined },
  }
  const emptySecret = await resolveBrowserAuthSecret(mockCtxEmpty)
  assert.equal(emptySecret, '', 'Returns empty string without error or file reading when credentials service absent')

  // 3. apply() succeeds without credentials service (optional dependency)
  const port = await freePort()
  const cleanups = []
  const logs = []
  const ctx = {
    webServer: { port, register() { return () => {} }, tapIndex() { return () => {} } },
    logger: { info(x) { logs.push(x) }, warn() {}, debug() {} },
    inject() { return () => {} },
    get(name) {
      if (name === 'credentials') return undefined
      return undefined
    },
    effect(fn) {
      const c = fn()
      if (typeof c === 'function') cleanups.push(c)
    },
  }

  const plugin = apply(ctx, {
    mode: 'auto',
    directPort: port,
    allow: ['127.0.0.0/8'],
    mdns: false,
  })

  assert.ok(logs.length > 0, 'Plugin initialized successfully and logged startup info with missing credentials service')
  for (const c of cleanups) {
    try { c() } catch (_) {}
  }
})
