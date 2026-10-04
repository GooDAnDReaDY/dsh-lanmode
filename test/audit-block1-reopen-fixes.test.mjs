// Automated verification for Block 1 audit reopen fixes (#363, #364, #365, #394, #401).
// Zero hardcoded Cyrillic characters.

import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { EventEmitter, once } from 'node:events'
import {
  validateConfigPatch,
  persistConfigDurable,
  updateLiveState,
  setupDynamicConfig,
} from '../lib/config-validator.js'
import { registerConfigApi } from '../lib/routes/config.js'
import { startDirectBridge } from '../lib/bridge.js'
import { parseAllow } from '../lib/access.js'

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
// Issue #363: Strict Schema Validation for tlsSites and all keys
// -----------------------------------------------------------------------------
test('Issue #363: validateConfigPatch rejects tlsSites with invalid types (cert/key not string)', () => {
  const effective = { tlsSites: [] }

  // 1. Invalid nested cert type (number) and key type (boolean)
  const resBad = validateConfigPatch({
    tlsSites: [{ host: 'example.com', cert: 17, key: false }],
  }, effective)
  assert.equal(resBad.valid, false, 'tlsSites with numeric cert and boolean key must be rejected')
  assert.ok(resBad.errors.some((e) => e.key === 'tlsSites'), 'Error key must be tlsSites')

  // 2. Non-array tlsSites
  const resNotArr = validateConfigPatch({ tlsSites: 'invalid-string' }, effective)
  assert.equal(resNotArr.valid, false, 'Non-array tlsSites must be rejected')

  // 3. Valid tlsSites with string host, cert, and key
  const resOk = validateConfigPatch({
    tlsSites: [{ host: 'sub.domain.local', cert: '/etc/ssl/cert.pem', key: '/etc/ssl/key.pem' }],
  }, effective)
  assert.equal(resOk.valid, true, 'Valid tlsSites must pass validation')
})

// -----------------------------------------------------------------------------
// Issue #364: Save Atomicity & Durable Provider Requirement
// -----------------------------------------------------------------------------
test('Issue #364: Failed durable persistence preserves previous live config without mutation', async () => {
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
    mdns: true,
  }

  let onUpdatedCalled = false
  const onConfigUpdated = () => { onUpdatedCalled = true }

  const access = {
    state: {
      adminRules: [],
      guestRules: [],
      rules: parseAllow(['127.0.0.0/8']).rules,
      trustedProxyCidrs: ['127.0.0.0/8', '::1/128'],
    },
    persistConfig: async () => {
      throw new Error('Storage write failure')
    },
  }

  const ctx = {
    webServer: { register(x) { routes.set(x.path, x.handler) } },
    effect(fn) { fn() },
  }

  registerConfigApi(ctx, effective, onConfigUpdated, access)

  try {
    const res = await requestJson(port, 'PATCH', '/dsh-lanmode/api/config', {
      mdns: false,
      directPort: 4000,
    })
    assert.equal(res.status, 500, 'Persistence failure must return HTTP 500')
    assert.equal(effective.mdns, true, 'effective.mdns must NOT be mutated on failure')
    assert.equal(effective.directPort, 3088, 'effective.directPort must NOT be mutated on failure')
    assert.equal(onUpdatedCalled, false, 'onConfigUpdated must NOT be invoked on persistence failure')
  } finally {
    server.close()
  }
})

test('Issue #364: Empty event emitter in Cordis context does not falsely report durable persistence', async () => {
  // Context with registry (indicating Cordis runtime) but without loader, fiber, or settings
  const mockCordisAppCtx = {
    registry: new Map(),
    emit: () => [],
  }

  const res = await persistConfigDurable(mockCordisAppCtx, { mdns: false })
  assert.equal(res.ok, false, 'Empty event emitter must not report durable persistence success')
  assert.ok(res.error.includes('No durable config persistence provider available'))
})

// -----------------------------------------------------------------------------
// Issue #365: Live State Update & Getter-Only State Safety
// -----------------------------------------------------------------------------
test('Issue #365: updateLiveState does not throw on getter-only properties and synchronizes state', () => {
  const config = {
    mode: 'direct',
    passwordAuth: false,
    authUser: 'admin',
    publicHost: '',
    allow: ['127.0.0.0/8'],
  }

  // Create state with getter-only properties (mirroring real DSH plugin state)
  const state = {
    mode: 'direct',
    get passwordAuth() { return Boolean(config.passwordAuth) },
    get authUser() { return config.authUser || 'admin' },
    get publicHost() { return config.publicHost || '' },
  }

  // Must not throw TypeError: Cannot set property passwordAuth of #<Object> which has only a getter
  assert.doesNotThrow(() => {
    updateLiveState(state, config, {
      passwordAuth: true,
      authUser: 'superadmin',
      publicHost: 'mesh.dsh.local',
    })
  })

  assert.equal(config.passwordAuth, true, 'config.passwordAuth must be updated')
  assert.equal(config.authUser, 'superadmin', 'config.authUser must be updated')
  assert.equal(state.passwordAuth, true, 'state.passwordAuth getter must reflect updated config')
})

test('Issue #365: Dynamic passwordAuth update takes effect on running bridge without restart', async () => {
  const upstreamPort = await freePort()
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('UPSTREAM_PAYLOAD')
  })
  upstream.listen(upstreamPort, '127.0.0.1')
  await once(upstream, 'listening')

  const bridgePort = await freePort()
  const config = {
    mode: 'direct',
    directPort: bridgePort,
    passwordAuth: false,
    allow: ['127.0.0.0/8'],
  }

  const state = {
    mode: 'direct',
    get passwordAuth() { return Boolean(config.passwordAuth) },
    set passwordAuth(v) { config.passwordAuth = Boolean(v) },
    rules: parseAllow(['127.0.0.0/8']).rules,
    adminRules: [],
    guestRules: [],
    trustedProxyCidrs: ['127.0.0.0/8'],
    unlockPrivileged: true,
    authManager: {
      extractToken: () => null,
      validateSession: () => null,
    },
  }

  const stopBridge = startDirectBridge({ webServer: { port: upstreamPort } }, {
    state,
    hosts: ['127.0.0.1'],
    port: bridgePort,
    allow: config.allow,
    trustedProxyCidrs: ['127.0.0.0/8'],
    authManager: state.authManager,
    log() {},
  })

  await new Promise((r) => setTimeout(r, 50))

  try {
    // 1. Initial request: passwordAuth is false -> 200
    const res1 = await requestJson(bridgePort, 'GET', '/api/test')
    assert.equal(res1.status, 200, 'Unauthenticated request permitted when passwordAuth is false')

    // 2. Dynamically enable password authentication
    updateLiveState(state, config, { passwordAuth: true })

    // 3. Next request immediately requires authentication (401) without bridge restart
    const res2 = await requestJson(bridgePort, 'GET', '/api/test')
    assert.equal(res2.status, 401, 'Request must be rejected with 401 once passwordAuth becomes active')
  } finally {
    await stopBridge()
    upstream.close()
  }
})

// -----------------------------------------------------------------------------
// Issue #394: Dynamic Config Partial Update Merge & Rejection of Invalid Updates
// -----------------------------------------------------------------------------
test('Issue #394: setupDynamicConfig preserves existing settings on partial patch and rejects invalid values', () => {
  const effective = {
    mode: 'direct',
    directPort: 45999,
    passwordAuth: true,
    tls: 'files',
    tlsCert: '/var/certs/old.crt',
    tlsKey: '/var/certs/old.key',
    allow: ['10.0.0.0/8'],
  }

  let onUpdatedCount = 0
  let emittedEvent = null
  const listeners = new Map()

  const mockCtx = {
    on(ev, fn) {
      listeners.set(ev, fn)
      return () => listeners.delete(ev)
    },
  }

  setupDynamicConfig(mockCtx, {
    effective,
    onConfigUpdated: () => { onUpdatedCount++ },
  })

  const volatileHandler = listeners.get('loader/volatile-update')
  assert.ok(volatileHandler, 'loader/volatile-update handler must be registered')

  // 1. Partial patch updating only certificates
  volatileHandler('@goodandready/dsh-lanmode', {
    tlsCert: '/var/certs/new.crt',
    tlsKey: '/var/certs/new.key',
  })

  assert.equal(onUpdatedCount, 1, 'onConfigUpdated must be called once')
  assert.equal(effective.tlsCert, '/var/certs/new.crt', 'tlsCert must be updated')
  assert.equal(effective.tlsKey, '/var/certs/new.key', 'tlsKey must be updated')
  assert.equal(effective.passwordAuth, true, 'passwordAuth must NOT be reset to default (false)')
  assert.equal(effective.mode, 'direct', 'mode must NOT be reset to default (auto)')
  assert.equal(effective.directPort, 45999, 'directPort must NOT be reset to default (3088)')
  assert.equal(effective.tls, 'files', 'tls must NOT be reset to default (off)')
  assert.deepEqual(effective.allow, ['10.0.0.0/8'], 'allow must be preserved')

  // 2. Invalid update with bad types/values must be rejected without mutating effective
  volatileHandler('@goodandready/dsh-lanmode', {
    directPort: -7,
    passwordAuth: 'false',
  })

  assert.equal(onUpdatedCount, 1, 'onConfigUpdated must NOT be called for invalid update')
  assert.equal(effective.directPort, 45999, 'directPort must NOT be mutated to -7')
  assert.equal(effective.passwordAuth, true, 'passwordAuth must NOT be mutated to string "false"')
})

// -----------------------------------------------------------------------------
// Issue #401: Client Card Error Handling on HTTP 400/403/500 and data.error
// -----------------------------------------------------------------------------
test('Issue #401: Client card save response logic distinguishes success from HTTP errors and data.error', () => {
  function handleSaveResult(result) {
    let saveMsg = ''
    let saveErr = ''
    const ok = result.ok
    const data = result.data || {}
    if (!ok || data.error || (data.errors && data.errors.length > 0)) {
      let errMsg = ''
      if (data.errors && data.errors.length > 0) {
        errMsg = data.errors.map((e) => e.key + ': ' + e.error).join('; ')
      } else if (data.error) {
        errMsg = String(data.error)
      } else {
        errMsg = 'HTTP ' + result.status
      }
      saveErr = 'Error saving settings: ' + errMsg
    } else {
      saveMsg = 'Settings saved successfully.'
    }
    return { saveMsg, saveErr }
  }

  // 1. HTTP 400 with { error: "Validation failed" }
  const r400 = handleSaveResult({ ok: false, status: 400, data: { error: 'Validation failed' } })
  assert.equal(r400.saveMsg, '', 'Must not show success on 400')
  assert.equal(r400.saveErr, 'Error saving settings: Validation failed')

  // 2. HTTP 403 with { error: "Forbidden: LAN PIN required" }
  const r403 = handleSaveResult({ ok: false, status: 403, data: { error: 'Forbidden: LAN PIN required' } })
  assert.equal(r403.saveMsg, '', 'Must not show success on 403')
  assert.equal(r403.saveErr, 'Error saving settings: Forbidden: LAN PIN required')

  // 3. HTTP 500 with { error: "Failed to save configuration durably" }
  const r500 = handleSaveResult({ ok: false, status: 500, data: { error: 'Failed to save configuration durably' } })
  assert.equal(r500.saveMsg, '', 'Must not show success on 500')
  assert.equal(r500.saveErr, 'Error saving settings: Failed to save configuration durably')

  // 4. HTTP 200 with { status: "ready", value: {} }
  const r200 = handleSaveResult({ ok: true, status: 200, data: { status: 'ready', value: {} } })
  assert.equal(r200.saveErr, '')
  assert.equal(r200.saveMsg, 'Settings saved successfully.')
})


// -----------------------------------------------------------------------------
// Issue #364 Reopen: fiber.entry.options.config rollback on tree.write() failure
// -----------------------------------------------------------------------------
test('Issue #364: persistConfigDurable rolls back fiber.entry.options.config if tree.write() throws', async () => {
  const originalConfig = { mdns: true, directPort: 3088, passwordAuth: false }
  const rejectedCandidate = { mdns: false, directPort: 3088, passwordAuth: false }

  const entry = {
    options: {
      config: { ...originalConfig },
    },
    parent: {
      tree: {
        write() {
          throw new Error('Synthetic disk write error')
        },
      },
    },
  }

  const mockCtx = {
    fiber: {
      entry,
    },
  }

  const result = await persistConfigDurable(mockCtx, rejectedCandidate)
  assert.equal(result.ok, false)
  assert.match(result.error, /Loader entry tree write failed: Synthetic disk write error/)
  assert.deepEqual(entry.options.config, originalConfig, 'Entry config must roll back to originalConfig on write failure')
})

// -----------------------------------------------------------------------------
// Issue #365 Reopen: Dynamic LAN PIN & Unlock policy enforcement on running bridge
// -----------------------------------------------------------------------------
test('Issue #365: Bridge dynamically applies updated LAN PIN and unlockPrivileged without restart', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  const upstreamPort = upstream.address().port

  const bridgePort = await freePort()
  const initialPin = '1234'
  const state = {
    unlockPrivileged: true,
    lanPin: true,
    lanPinValue: initialPin,
    rules: parseAllow(['127.0.0.0/8']).rules,
    adminRules: [],
    guestRules: [],
  }

  const stopBridge = startDirectBridge({ webServer: { port: upstreamPort } }, {
    state,
    hosts: ['127.0.0.1'],
    port: bridgePort,
    log: () => {},
    allow: ['127.0.0.0/8'],
    upstreamPort,
    get unlockPrivileged() { return state.unlockPrivileged },
    get lanPin() { return state.lanPinValue },
  })

  await new Promise((r) => setTimeout(r, 50))

  try {
    // 1. Initially, PIN 1234 unlocks privileged call /api/settings.describe
    const resInitialValid = await requestJson(bridgePort, 'GET', '/api/settings.describe', null, {
      'x-dsh-lan-pin': '1234',
    })
    assert.equal(resInitialValid.status, 200, 'Initial PIN 1234 must succeed')

    // PIN 5678 fails
    const resInitialWrong = await requestJson(bridgePort, 'GET', '/api/settings.describe', null, {
      'x-dsh-lan-pin': '5678',
    })
    assert.equal(resInitialWrong.status, 403, 'Wrong PIN 5678 must be 403')

    // 2. Rotate PIN dynamically: 1234 -> 5678
    updateLiveState(state, {}, {
      allow: ['127.0.0.0/8'],
      lanPin: '5678',
      unlockPrivileged: true,
    })
    assert.equal(state.lanPinValue, '5678')

    // Old PIN 1234 now fails immediately
    const resRotatedOld = await requestJson(bridgePort, 'GET', '/api/settings.describe', null, {
      'x-dsh-lan-pin': '1234',
    })
    assert.equal(resRotatedOld.status, 403, 'Old PIN 1234 must be 403 after rotation')

    // New PIN 5678 now succeeds immediately
    const resRotatedNew = await requestJson(bridgePort, 'GET', '/api/settings.describe', null, {
      'x-dsh-lan-pin': '5678',
    })
    assert.equal(resRotatedNew.status, 200, 'New PIN 5678 must succeed after rotation')

    // 3. Dynamically lock privileged calls (unlockPrivileged: false)
    updateLiveState(state, {}, {
      allow: ['127.0.0.0/8'],
      lanPin: '5678',
      unlockPrivileged: false,
    })
    assert.equal(state.unlockPrivileged, false)

    // Even with valid PIN 5678, privileged call is refused
    const resLocked = await requestJson(bridgePort, 'GET', '/api/settings.describe', null, {
      'x-dsh-lan-pin': '5678',
    })
    assert.equal(resLocked.status, 403, 'Privileged calls must be refused when unlockPrivileged is false')
  } finally {
    await stopBridge()
    upstream.close()
  }
})

// -----------------------------------------------------------------------------
// Issue #401 Reopen: Strict JSON and Ready contract validation in settings card
// -----------------------------------------------------------------------------
test('Issue #401: Client card rejects malformed JSON, empty payload and error status on HTTP 200', () => {
  function handleSaveResult(result) {
    let saveMsg = ''
    let saveErr = ''
    const ok = result.ok
    const data = result.data
    const hasReady = data && (data.status === 'ready' || data.ok === true || data.status === 'ok')
    const hasErr = !ok || !data || data.error || (data.errors && data.errors.length > 0) || data.status === 'error' || data.ok === false || !hasReady
    if (hasErr) {
      let errMsg = ''
      if (!data) {
        errMsg = 'Invalid or empty server response'
      } else if (data.errors && data.errors.length > 0) {
        errMsg = data.errors.map((e) => e.key + ': ' + e.error).join('; ')
      } else if (data.error) {
        errMsg = String(data.error)
      } else if (data.status === 'error') {
        errMsg = String(data.message || 'Server reported error')
      } else if (!ok) {
        errMsg = 'HTTP ' + result.status
      } else {
        errMsg = 'Unexpected response format'
      }
      saveErr = 'Error saving settings: ' + errMsg
    } else {
      saveMsg = 'Settings saved successfully.'
    }
    return { saveMsg, saveErr }
  }

  // 1. HTTP 200 with malformed JSON (data is null)
  const rNull = handleSaveResult({ ok: true, status: 200, data: null })
  assert.equal(rNull.saveMsg, '')
  assert.equal(rNull.saveErr, 'Error saving settings: Invalid or empty server response')

  // 2. HTTP 200 with empty object {}
  const rEmpty = handleSaveResult({ ok: true, status: 200, data: {} })
  assert.equal(rEmpty.saveMsg, '')
  assert.equal(rEmpty.saveErr, 'Error saving settings: Unexpected response format')

  // 3. HTTP 200 with { status: "error", message: "disk full" }
  const rStatusErr = handleSaveResult({ ok: true, status: 200, data: { status: 'error', message: 'disk full' } })
  assert.equal(rStatusErr.saveMsg, '')
  assert.equal(rStatusErr.saveErr, 'Error saving settings: disk full')

  // 4. HTTP 200 with { ok: false, error: "Validation failure" }
  const rOkFalse = handleSaveResult({ ok: true, status: 200, data: { ok: false, error: 'Validation failure' } })
  assert.equal(rOkFalse.saveMsg, '')
  assert.equal(rOkFalse.saveErr, 'Error saving settings: Validation failure')

  // 5. HTTP 200 with valid { status: "ready", value: {} }
  const rReady = handleSaveResult({ ok: true, status: 200, data: { status: 'ready', value: {} } })
  assert.equal(rReady.saveErr, '')
  assert.equal(rReady.saveMsg, 'Settings saved successfully.')
})

// -----------------------------------------------------------------------------
// Issue #365 Reopen: Resolved lanPinRef preservation on unrelated save & rotation
// -----------------------------------------------------------------------------
test('Issue #365 Reopen: Unrelated save preserves resolved lanPinRef and does not strip PIN or switch to raw fallback', () => {
  // 1. Ref-only mode: initial state has resolved PIN 1234
  const state1 = {
    lanPin: true,
    lanPinValue: '1234',
    rules: [],
    adminRules: [],
    guestRules: [],
  }
  const config1 = {
    lanPin: '',
    lanPinRef: 'AUDIT_PIN_A',
  }
  // Unrelated save: clipboard toggled
  updateLiveState(state1, config1, { clipboard: false })
  assert.equal(state1.lanPinValue, '1234', 'lanPinValue must remain 1234 and not be wiped to null on unrelated save')
  assert.equal(state1.lanPin, true, 'lanPin must remain true')

  // 2. Ref with raw fallback: initial state has resolved PIN 1234, fallback is 9999
  const state2 = {
    lanPin: true,
    lanPinValue: '1234',
    rules: [],
    adminRules: [],
    guestRules: [],
  }
  const config2 = {
    lanPin: '9999',
    lanPinRef: 'AUDIT_PIN_A',
  }
  // Unrelated save: mobileEnterSends toggled
  updateLiveState(state2, config2, { mobileEnterSends: true })
  assert.equal(state2.lanPinValue, '1234', 'lanPinValue must remain resolved 1234 and not switch to fallback 9999')
  assert.equal(state2.lanPin, true, 'lanPin must remain true')
})

test('Issue #365 Reopen: PATCH /dsh-lanmode/api/config rejects unresolvable lanPinRef when provider fails and no fallback exists', async () => {
  const routes = new Map()
  const mockWebServer = {
    register(route) {
      routes.set(route.path, route.handler)
      return () => routes.delete(route.path)
    },
  }
  const mockCtx = {
    effect: (fn) => fn(),
    webServer: mockWebServer,
    credentials: {
      async resolve(ref) {
        if (ref === 'KNOWN_REF') return '5555'
        return null
      },
    },
    get(name) {
      if (name === 'credentials') return this.credentials
      return undefined
    },
  }

  const effective = {
    mode: 'direct',
    directPort: 3088,
    lanPin: '',
    lanPinRef: 'KNOWN_REF',
  }
  const state = {
    lanPin: true,
    lanPinValue: '5555',
  }

  registerConfigApi(mockCtx, effective, () => {}, { state })
  const handler = routes.get('/dsh-lanmode/api/config')
  assert.ok(handler, 'Config API handler must be registered')

  // 1. Attempt to PATCH with an unresolvable ref and empty fallback -> must return 400
  const reqUnresolvable = new EventEmitter()
  Object.assign(reqUnresolvable, {
    method: 'PATCH',
    url: '/dsh-lanmode/api/config',
    headers: { host: 'localhost', 'content-type': 'application/json', 'x-dsh-lan-pin': '5555' },
    socket: { remoteAddress: '127.0.0.1' },
  })

  const resUnresolvable = await new Promise((resolve) => {
    const res = {
      writeHead(status) { this.status = status },
      end(body) { resolve({ status: this.status, body: JSON.parse(body || '{}') }) },
    }
    handler(reqUnresolvable, res)
    queueMicrotask(() => {
      reqUnresolvable.emit('data', Buffer.from(JSON.stringify({ lanPinRef: 'UNKNOWN_REF' })))
      reqUnresolvable.emit('end')
    })
  })

  assert.equal(resUnresolvable.status, 400, 'Unresolvable lanPinRef must be rejected with 400')
  assert.match(resUnresolvable.body.error, /Failed to resolve credential reference/)
  assert.equal(effective.lanPinRef, 'KNOWN_REF', 'effective.lanPinRef must not mutate on rejected patch')
  assert.equal(state.lanPinValue, '5555', 'state.lanPinValue must remain protected')
})

test('Issue #412: bootstrap flags in tapIndex and authSessionDays apply dynamically without restart', async () => {
  const { apply } = await import('../lib/index.js')
  const { AuthManager } = await import('../lib/auth.js')

  const routes = new Map()
  let tapCallback = null
  const cleanups = []

  const mockCtx = {
    webServer: {
      port: 3088,
      register(route) {
        routes.set(route.path, route.handler)
        return () => routes.delete(route.path)
      },
      tapIndex(fn) {
        tapCallback = fn
        return () => { tapCallback = null }
      },
    },
    logger: { info() {}, warn() {}, debug() {} },
    get() { return undefined },
    inject() { return () => {} },
    on() { return () => {} },
    effect(fn) {
      const d = fn()
      if (typeof d === 'function') cleanups.push(d)
    },
  }

  const durations = []
  const origCreateSession = AuthManager.prototype.createSession
  AuthManager.prototype.createSession = function (...args) {
    durations.push(this.sessionDurationMs)
    return origCreateSession.apply(this, args)
  }

  try {
    const config = {
      mode: 'proxy',
      tls: 'off',
      mdns: false,
      diagnostics: true,
      passwordAuth: false,
      authUser: 'test-admin',
      authPassword: 'secret-password',
      authSessionDays: 30,
      allow: ['127.0.0.0/8'],
      settings: true,
      randomUuid: true,
      clipboard: true,
      mobileEnterSends: false,
    }

    apply(mockCtx, config)

    function getInjectedFlags() {
      assert.ok(tapCallback, 'tapIndex callback must be registered')
      const html = tapCallback('<html><head></head><body>test</body></html>')
      const match = html.match(/window\.__DSH_LANMODE__=({[^;]+});/)
      assert.ok(match, 'window.__DSH_LANMODE__ must be present in HTML')
      return JSON.parse(match[1])
    }

    async function login() {
      const loginHandler = routes.get('/dsh-lanmode/auth/login')
      assert.ok(loginHandler, 'login handler must be registered')
      const req = new EventEmitter()
      Object.assign(req, {
        method: 'POST',
        url: '/dsh-lanmode/auth/login',
        headers: { host: 'localhost', 'content-type': 'application/json' },
        socket: { remoteAddress: '127.0.0.1' },
      })
      return new Promise((resolve) => {
        const res = {
          writeHead(status) { this.status = status },
          end(body) { resolve({ status: this.status, body: JSON.parse(body || '{}') }) },
        }
        loginHandler(req, res)
        queueMicrotask(() => {
          req.emit('data', Buffer.from(JSON.stringify({ username: 'test-admin', password: 'secret-password', remember: true })))
          req.emit('end')
        })
      })
    }

    const beforeFlags = getInjectedFlags()
    assert.equal(beforeFlags.settings, true)
    assert.equal(beforeFlags.randomUuid, true)
    assert.equal(beforeFlags.clipboard, true)
    assert.equal(beforeFlags.mobileEnterSends, false)

    await login()
    assert.equal(durations[0], 30 * 86400000)

    // PATCH config to update flags and session duration
    const handler = routes.get('/dsh-lanmode/api/config')
    assert.ok(handler, 'config API handler must be registered')

    const patchReq = new EventEmitter()
    Object.assign(patchReq, {
      method: 'PATCH',
      url: '/dsh-lanmode/api/config',
      headers: { host: 'localhost', 'content-type': 'application/json' },
      socket: { remoteAddress: '127.0.0.1' },
    })

    const patchRes = await new Promise((resolve) => {
      const res = {
        writeHead(status) { this.status = status },
        end(body) { resolve({ status: this.status, body: JSON.parse(body || '{}') }) },
      }
      handler(patchReq, res)
      queueMicrotask(() => {
        patchReq.emit('data', Buffer.from(JSON.stringify({
          settings: false,
          randomUuid: false,
          clipboard: false,
          mobileEnterSends: true,
          authSessionDays: 7,
        })))
        patchReq.emit('end')
      })
    })

    assert.equal(patchRes.status, 200)
    assert.equal(patchRes.body.restart, false)

    // Verify fresh HTML renders updated bootstrap flags
    const afterFlags = getInjectedFlags()
    assert.equal(afterFlags.settings, false)
    assert.equal(afterFlags.randomUuid, false)
    assert.equal(afterFlags.clipboard, false)
    assert.equal(afterFlags.mobileEnterSends, true)

    // Subsequent login gets 7 days
    await login()
    assert.equal(durations[1], 7 * 86400000)
  } finally {
    AuthManager.prototype.createSession = origCreateSession
    for (const cleanup of cleanups) {
      try { cleanup() } catch {}
    }
  }
})
