import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { MAX_BODY_BYTES } from '../lib/body-limit.js'
import { registerConfigApi } from '../lib/routes/config.js'
import { registerDeviceRoutes } from '../lib/routes/devices.js'
import { registerTunnelRoutes } from '../lib/routes/tunnel.js'
import { resolveClientRole, verifyAdminAccess, isTrustedSameOrigin } from '../lib/access.js'
import { startDirectBridge } from '../lib/bridge.js'

const headers = { host: '127.0.0.1', origin: 'http://127.0.0.1', 'content-type': 'application/json' }

function fakeReq({ method, body }) {
  return {
    method,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
    on(event, cb) {
      if (event === 'data') cb(body)
      if (event === 'end') cb()
      return this
    },
    destroy() {},
  }
}

function call(handler, opts) {
  return new Promise((resolve) => {
    const res = {
      status: 0,
      payload: '',
      writeHead(status) { this.status = status },
      end(payload) { this.payload = payload || ''; resolve(this) },
    }
    handler(fakeReq(opts), res)
  })
}

function routesOf(register) {
  const routes = []
  const ctx = {
    effect(fn) { fn() },
    webServer: { register(route) { routes.push(route) } },
  }
  register(ctx)
  return routes
}

const adminState = {
  adminRules: [],
  guestRules: [],
  rules: [],
  passwordAuth: false,
  authManager: null,
}

test('oversized config body is rejected and does not change settings', async () => {
  const effective = { mode: 'direct', lanPin: 'pin' }
  let updates = 0
  const handler = routesOf((ctx) => {
    registerConfigApi(ctx, effective, () => { updates += 1 }, { state: adminState })
  }).find((route) => route.path === '/dsh-lanmode/api/config').handler

  const huge = await call(handler, { method: 'PATCH', body: 'x'.repeat(MAX_BODY_BYTES + 1) })
  assert.equal(huge.status, 413)
  assert.equal(effective.mode, 'direct')
  assert.equal(updates, 0)

  const small = await call(handler, { method: 'PATCH', body: JSON.stringify({ mode: 'auto' }) })
  assert.equal(small.status, 200)
  assert.equal(effective.mode, 'auto')
  assert.equal(updates, 1)
})

test('oversized device revoke body is rejected and does not revoke', async () => {
  let revoked = null
  const handler = routesOf((ctx) => {
    registerDeviceRoutes(ctx, {
      state: adminState,
      config: { passwordAuth: false },
      deviceRegistry: { revoke(id) { revoked = id }, setNickname() {}, list() { return [] } },
      resolveClientRole,
      verifyAdminAccess,
      isTrustedSameOrigin,
    })
  }).find((route) => route.path === '/dsh-lanmode/devices/revoke').handler

  const huge = await call(handler, { method: 'POST', body: 'x'.repeat(MAX_BODY_BYTES + 1) })
  assert.equal(huge.status, 413)
  assert.equal(revoked, null)

  const small = await call(handler, { method: 'POST', body: JSON.stringify({ id: 'dev-1' }) })
  assert.equal(small.status, 200)
  assert.equal(revoked, 'dev-1')
})

test('oversized tunnel toggle body is rejected and does not start the tunnel', async () => {
  let started = false
  const handler = routesOf((ctx) => {
    registerTunnelRoutes(ctx, {
      state: adminState,
      config: {},
      tunnel: { getState() { return { enabled: started } }, async start() { started = true }, stop() {} },
      resolveSecret: async () => '',
      resolveClientRole,
      verifyAdminAccess,
      isTrustedSameOrigin,
    })
  }).find((route) => route.path === '/dsh-lanmode/tunnel/toggle').handler

  const huge = await call(handler, { method: 'POST', body: 'x'.repeat(MAX_BODY_BYTES + 1) })
  assert.equal(huge.status, 413)
  assert.equal(started, false)
})

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

test('bridge revoke rejects an oversized body before changing the roster', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200)
    res.end('ok')
  })
  const upstreamPort = await listen(upstream)
  const bridge = http.createServer()
  const bridgePort = await listen(bridge)
  bridge.close()
  let revoked = null
  const stop = startDirectBridge(
    { webServer: { port: upstreamPort } },
    {
      hosts: ['127.0.0.1'],
      port: bridgePort,
      allow: [],
      log: () => {},
      deviceRegistry: {
        revoke(id) { revoked = id },
        list() { return [] },
        isRevoked() { return false },
        touch() {},
        revokeAllExcept() { revoked = 'others' },
      },
    },
  )
  await new Promise((r) => setTimeout(r, 120))
  try {
    const huge = await fetch('http://127.0.0.1:' + bridgePort + '/dsh-lanmode/api/devices/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(MAX_BODY_BYTES + 1),
    })
    assert.equal(huge.status, 413)
    assert.equal(revoked, null)

    const small = await fetch('http://127.0.0.1:' + bridgePort + '/dsh-lanmode/api/devices/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: 'phone-1' }),
    })
    assert.equal(small.status, 200)
    assert.equal(revoked, 'phone-1')
  } finally {
    stop()
    upstream.close()
  }
})