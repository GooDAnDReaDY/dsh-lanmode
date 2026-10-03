import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { EventEmitter } from 'node:events'
import { status, registerPluginUpdater } from '../lib/plugin-updater.js'
import { DeviceRegistry } from '../lib/devices.js'
import { registerDeviceRoutes } from '../lib/routes/devices.js'
import { handleBridgeLocalRoutes } from '../lib/bridge-local.js'
import { CloudflareTunnel } from '../lib/tunnel.js'
import { registerTunnelRoutes } from '../lib/routes/tunnel.js'
import { apply } from '../lib/index.js'

function makeReqRes({ method = 'POST', url = '/', headers = {}, body = '' } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  req.headers = { ...headers }
  req.socket = { remoteAddress: '127.0.0.1' }

  let statusCode = 200
  let resHeaders = {}
  let responseBody = ''
  let onFinish = null

  const res = {
    writeHead(code, hdrs = {}) {
      statusCode = code
      resHeaders = { ...resHeaders, ...hdrs }
    },
    setHeader(k, v) {
      resHeaders[k.toLowerCase()] = v
    },
    end(data) {
      if (data !== undefined) responseBody += data
      this.finished = true
      if (onFinish) onFinish()
    },
    finished: false,
    getStatus: () => statusCode,
    getBody: () => responseBody,
    getHeaders: () => resHeaders,
    wait: () => new Promise((resolve) => {
      if (res.finished) resolve()
      else onFinish = resolve
    }),
  }

  process.nextTick(() => {
    if (body) {
      req.emit('data', Buffer.from(body))
    }
    req.emit('end')
  })

  return { req, res }
}

test('Issue #371: status() includes name and checkedAt', async () => {
  const result = await status({
    packageName: '@goodandready/dsh-lanmode',
    manifestUrl: new URL('../package.json', import.meta.url),
    registry: 'https://registry.npmjs.org',
  }, {
    profileName: 'web',
    cliEntry: '/fake/entry',
  })

  assert.equal(result.name, '@goodandready/dsh-lanmode')
  assert.equal(result.packageName, '@goodandready/dsh-lanmode')
  assert.ok(typeof result.checkedAt === 'number')
  assert.ok(result.checkedAt > 0)
})

test('Issue #371: POST check does not trigger update and returns success: true with name', async () => {
  let registeredRoute = null
  const fakeWebServer = {
    register(route) { registeredRoute = route },
  }

  registerPluginUpdater({ webServer: fakeWebServer }, {
    endpoint: '/api/dsh-lanmode/update',
    packageName: '@goodandready/dsh-lanmode',
    manifestUrl: new URL('../package.json', import.meta.url),
  })

  assert.ok(registeredRoute, 'Route must be registered')

  const { req, res } = makeReqRes({
    method: 'POST',
    url: '/api/dsh-lanmode/update',
    headers: {
      'x-dsh-plugin-update': '1',
      'sec-fetch-site': 'same-origin',
      origin: 'http://127.0.0.1:3080',
      host: '127.0.0.1:3080',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'check' }),
  })

  await registeredRoute.handler(req, res)
  assert.equal(res.getStatus(), 200)
  const json = JSON.parse(res.getBody())
  assert.equal(json.success, true)
  assert.equal(json.name, '@goodandready/dsh-lanmode')
  assert.equal(json.packageName, '@goodandready/dsh-lanmode')
  assert.equal(typeof json.currentVersion, 'string')
})

test('Issue #371: POST update checks profile lock and returns 409 when locked', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-lock-update-'))
  const origProfileDir = process.env.DSH_PROFILE_DIR
  try {
    process.env.DSH_PROFILE_DIR = tmpDir
    fs.writeFileSync(path.join(tmpDir, 'package.json.lock'), JSON.stringify({ pid: process.pid }))

    let registeredRoute = null
    const fakeWebServer = {
      register(route) { registeredRoute = route },
    }

    registerPluginUpdater({ webServer: fakeWebServer }, {
      endpoint: '/api/dsh-lanmode/update',
      packageName: '@goodandready/dsh-lanmode',
      manifestUrl: new URL('../package.json', import.meta.url),
    })

    const { req, res } = makeReqRes({
      method: 'POST',
      url: '/api/dsh-lanmode/update',
      headers: {
        'x-dsh-plugin-update': '1',
        'sec-fetch-site': 'same-origin',
        origin: 'http://127.0.0.1:3080',
        host: '127.0.0.1:3080',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'update' }),
    })

    await registeredRoute.handler(req, res)
    assert.equal(res.getStatus(), 409)
    assert.ok(res.getBody().includes('Another package installation is in progress'))
  } finally {
    if (origProfileDir !== undefined) process.env.DSH_PROFILE_DIR = origProfileDir
    else delete process.env.DSH_PROFILE_DIR
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('Issue #371: POST with unknown action returns 400', async () => {
  let registeredRoute = null
  const fakeWebServer = {
    register(route) { registeredRoute = route },
  }

  registerPluginUpdater({ webServer: fakeWebServer }, {
    endpoint: '/api/dsh-lanmode/update',
    packageName: '@goodandready/dsh-lanmode',
    manifestUrl: new URL('../package.json', import.meta.url),
  })

  const { req, res } = makeReqRes({
    method: 'POST',
    url: '/api/dsh-lanmode/update',
    headers: {
      'x-dsh-plugin-update': '1',
      'sec-fetch-site': 'same-origin',
      origin: 'http://127.0.0.1:3080',
      host: '127.0.0.1:3080',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'unknown_command' }),
  })

  await registeredRoute.handler(req, res)
  assert.equal(res.getStatus(), 400)
  assert.ok(res.getBody().includes('Unsupported updater action'))
})

test('Issue #370: DeviceRegistry handles disk persistence failure gracefully', () => {
  const tmpFile = path.join(os.tmpdir(), `dsh-dev-test-${Date.now()}.json`)
  const reg = new DeviceRegistry(tmpFile)

  reg.touch('token-abc', { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' }, socket: { remoteAddress: '192.168.1.15' } })
  assert.equal(reg.list().length, 1)

  // Force save to fail
  reg.save = () => false

  // 1. setNickname rollback on save failure
  const nickResult = reg.setNickname('token-abc', 'My iPhone')
  assert.equal(nickResult, false, 'setNickname must return false when save fails')
  assert.equal(reg.list()[0].nickname, '', 'Nickname must roll back to original')

  // 2. revoke keeps in-memory state but returns false
  const revokeResult = reg.revoke('token-abc')
  assert.equal(revokeResult, false, 'revoke must return false when save fails')
  assert.equal(reg.isRevoked('token-abc'), true, 'Device must be marked revoked in memory')

  // 3. revokeAll returns false
  const revokeAllResult = reg.revokeAll()
  assert.equal(revokeAllResult, false, 'revokeAll must return false when save fails')

  // 4. revokeAllExcept returns false
  const revokeOthersResult = reg.revokeAllExcept('token-abc')
  assert.equal(revokeOthersResult, false, 'revokeAllExcept must return false when save fails')
})

test('Issue #370: routes/devices returns 500 when registry fails to persist', async () => {
  const routes = new Map()
  const mockCtx = {
    effect: (fn) => fn(),
    webServer: {
      register: (spec) => routes.set(spec.path, spec.handler),
    },
  }

  const failingRegistry = {
    list: () => [],
    setNickname: () => false,
    revoke: () => false,
    revokeAll: () => false,
  }

  registerDeviceRoutes(mockCtx, {
    state: {},
    config: {},
    deviceRegistry: failingRegistry,
    resolveClientRole: () => 'admin',
    verifyAdminAccess: () => ({ ok: true }),
    isTrustedSameOrigin: () => true,
  })

  // 1. Nickname failure -> 500
  const nickReqRes = makeReqRes({
    method: 'POST',
    url: '/dsh-lanmode/devices/nickname',
    body: JSON.stringify({ id: 'dev-1', nickname: 'Test' }),
  })
  routes.get('/dsh-lanmode/devices/nickname')(nickReqRes.req, nickReqRes.res)
  await nickReqRes.res.wait()
  assert.equal(nickReqRes.res.getStatus(), 500)
  assert.equal(JSON.parse(nickReqRes.res.getBody()).ok, false)

  // 2. Revoke failure -> 500
  const revokeReqRes = makeReqRes({
    method: 'POST',
    url: '/dsh-lanmode/devices/revoke',
    body: JSON.stringify({ id: 'dev-1' }),
  })
  routes.get('/dsh-lanmode/devices/revoke')(revokeReqRes.req, revokeReqRes.res)
  await revokeReqRes.res.wait()
  assert.equal(revokeReqRes.res.getStatus(), 500)
  assert.equal(JSON.parse(revokeReqRes.res.getBody()).ok, false)

  // 3. Kill-all failure -> 500
  const killReqRes = makeReqRes({
    method: 'POST',
    url: '/dsh-lanmode/devices/kill-all',
  })
  routes.get('/dsh-lanmode/devices/kill-all')(killReqRes.req, killReqRes.res)
  await killReqRes.res.wait()
  assert.equal(killReqRes.res.getStatus(), 500)
  assert.equal(JSON.parse(killReqRes.res.getBody()).ok, false)
})

test('Issue #370 & #256: bridge-local routes check return value and evaluate isPasswordAuth function', async () => {
  let capturedBanReq = false
  const deps = {
    options: {
      banList: {
        listBans: () => [{ ip: '1.2.3.4' }],
      },
    },
    authManager: {
      revokeSession: () => {},
    },
    // Issue #256: passed as function
    isPasswordAuth: () => false,
    remote: '127.0.0.1',
    role: 'admin',
    denyUnlessAdmin: (_req, _res, _auth, passwordActive) => {
      // passwordActive must be boolean false, not function
      assert.equal(typeof passwordActive, 'boolean')
      assert.equal(passwordActive, false)
      capturedBanReq = true
      return true
    },
    deviceRegistry: {
      revoke: () => false, // fails to persist
      revokeAllExcept: () => false, // fails to persist
    },
  }

  // 1. Issue #256: Ban route
  const banReqRes = makeReqRes({ method: 'POST', url: '/dsh-lanmode/bans', body: JSON.stringify({ ip: '1.2.3.4' }) })
  const handledBan = handleBridgeLocalRoutes(banReqRes.req, banReqRes.res, deps)
  assert.equal(handledBan, true)
  assert.equal(capturedBanReq, true)

  // 2. Issue #370: Revoke failure in bridge returns 500
  const revokeReqRes = makeReqRes({
    method: 'POST',
    url: '/dsh-lanmode/api/devices/revoke',
    body: JSON.stringify({ deviceId: 'dev-1' }),
  })
  handleBridgeLocalRoutes(revokeReqRes.req, revokeReqRes.res, deps)
  await revokeReqRes.res.wait()
  assert.equal(revokeReqRes.res.getStatus(), 500)
  assert.equal(JSON.parse(revokeReqRes.res.getBody()).ok, false)

  // 3. Issue #370: Revoke others failure in bridge returns 500
  const revokeOthersReqRes = makeReqRes({
    method: 'POST',
    url: '/dsh-lanmode/api/devices/revoke-others',
    body: JSON.stringify({ currentId: 'dev-1' }),
  })
  handleBridgeLocalRoutes(revokeOthersReqRes.req, revokeOthersReqRes.res, deps)
  await revokeOthersReqRes.res.wait()
  assert.equal(revokeOthersReqRes.res.getStatus(), 500)
  assert.equal(JSON.parse(revokeOthersReqRes.res.getBody()).ok, false)
})

test('Issue #47: Cloudflare named tunnel detects connection readiness and uses hostname', async () => {
  const tunnel = new CloudflareTunnel({
    mode: 'named',
    token: 'test-token',
    hostname: 'lan.mycloud.org',
  })

  assert.equal(tunnel.mode, 'named')
  assert.equal(tunnel.hostname, 'lan.mycloud.org')
  assert.equal(tunnel.getState().hostname, 'lan.mycloud.org')

  // Verify buildArgs for named tunnel
  const args = tunnel.buildArgs()
  assert.deepEqual(args, ['tunnel', 'run', '--token', 'test-token'])

  // Verify route toggle passes mode and hostname
  const routes = {}
  const mockCtx = {
    effect: (fn) => fn(),
    webServer: { register: (r) => { routes[r.path] = r.handler } },
  }
  let capturedOpts = null
  const mockTunnel = {
    status: 'stopped',
    getState: () => ({ status: 'active', publicUrl: 'https://custom.host' }),
    start: async (opts) => { capturedOpts = opts },
    stop: () => {},
  }
  registerTunnelRoutes(mockCtx, {
    state: {},
    config: {},
    tunnel: mockTunnel,
    resolveSecret: async () => 'resolved-tok',
    resolveClientRole: () => 'admin',
    verifyAdminAccess: () => ({ ok: true }),
    isTrustedSameOrigin: () => true,
  })

  const toggleReqRes = makeReqRes({
    method: 'POST',
    url: '/dsh-lanmode/tunnel/toggle',
    body: JSON.stringify({ enabled: true, mode: 'named', hostname: 'custom.host' }),
  })
  routes['/dsh-lanmode/tunnel/toggle'](toggleReqRes.req, toggleReqRes.res)
  await toggleReqRes.res.wait()
  assert.equal(toggleReqRes.res.getStatus(), 200)
  assert.equal(capturedOpts.mode, 'named')
  assert.equal(capturedOpts.hostname, 'custom.host')
})

test('Issue #48: Plugin lifecycle manages WAN tunnel effect', () => {
  const indexSource = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.ok(indexSource.includes('dsh-lanmode: WAN tunnel lifecycle'), 'Lifecycle effect must be registered')
  assert.ok(indexSource.includes("config.tunnel !== 'off'"), 'Must check tunnel config before starting')

  // Apply with tunnel off ensures clean disposal without starting tunnel
  const disposedEffects = []
  const mockCtx = {
    webServer: {
      port: 3088,
      register: () => () => {},
      tapIndex: () => () => {},
    },
    inject: () => {},
    effect: (fn) => {
      const cleanup = fn()
      if (typeof cleanup === 'function') {
        disposedEffects.push(cleanup)
      }
    },
  }

  apply(mockCtx, {
    tunnel: 'off',
    passwordAuth: false,
    diagnostics: false,
    mdns: false,
  })

  assert.ok(disposedEffects.length > 0, 'Effects must be registered')

  // Clean up
  for (const dispose of disposedEffects) {
    dispose()
  }
})
