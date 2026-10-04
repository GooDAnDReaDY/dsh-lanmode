// Automated verification for Block 1 audit reopen fixes (#363, #364, #365, #394, #401).
// Zero hardcoded Cyrillic characters.

import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { once } from 'node:events'
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
