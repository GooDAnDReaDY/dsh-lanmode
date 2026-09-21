import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { startDirectBridge } from '../lib/bridge.js'
import { registerMobileQrTool } from '../lib/mobile-tool.js'
import { AuthManager } from '../lib/auth.js'
import { resetPinRateLimit } from '../lib/privileged.js'

test('Issue #154: LAN PIN challenge, brute-force rate limit, and privilegedExtra in bridge.js', async () => {
  resetPinRateLimit()
  let upstreamCalled = false
  const upstream = http.createServer((req, res) => {
    upstreamCalled = true
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  const upstreamPort = upstream.address().port

  const bridgePort = 31980
  const stop = startDirectBridge(
    { webServer: { port: upstreamPort } },
    {
      hosts: ['127.0.0.1'],
      port: bridgePort,
      unlockPrivileged: true,
      lanPin: '9876',
      privilegedExtra: ['^/api/custom-secret$'],
      log: () => {},
    }
  )

  try {
    // 1. Without PIN: 403 x-dsh-lan-pin-required (attempt 1)
    const resNoPin = await fetch(`http://127.0.0.1:${bridgePort}/api/settings.describe`)
    assert.equal(resNoPin.status, 403)
    assert.equal(resNoPin.headers.get('x-dsh-lan-pin-required'), '1')
    const bodyNoPin = await resNoPin.text()
    assert.match(bodyNoPin, /PIN authentication required/)

    // 2. Extra privileged endpoint (/api/custom-secret) also challenged (attempt 2)
    const resExtra = await fetch(`http://127.0.0.1:${bridgePort}/api/custom-secret`)
    assert.equal(resExtra.status, 403)
    assert.equal(resExtra.headers.get('x-dsh-lan-pin-required'), '1')

    // 3. Brute force defense: attempts 3, 4, 5
    const res3 = await fetch(`http://127.0.0.1:${bridgePort}/api/settings.describe`, {
      headers: { 'x-dsh-lan-pin': '0000' },
    })
    assert.equal(res3.status, 403)

    const res4 = await fetch(`http://127.0.0.1:${bridgePort}/api/settings.describe`, {
      headers: { 'x-dsh-lan-pin': '0000' },
    })
    assert.equal(res4.status, 403)

    // 5th failed attempt triggers rate limit lockout
    const res5 = await fetch(`http://127.0.0.1:${bridgePort}/api/settings.describe`, {
      headers: { 'x-dsh-lan-pin': '0000' },
    })
    assert.equal(res5.status, 403)

    // 6th attempt returns 429
    const res429 = await fetch(`http://127.0.0.1:${bridgePort}/api/settings.describe`, {
      headers: { 'x-dsh-lan-pin': '9876' },
    })
    assert.equal(res429.status, 429)
    assert.ok(res429.headers.get('retry-after'))
    assert.ok(res429.headers.get('x-dsh-lan-pin-retry-after'))
  } finally {
    resetPinRateLimit()
    await stop()
    await new Promise((r) => upstream.close(r))
  }
})

test('Issue #154: Correct PIN allows privileged requests through bridge', async () => {
  resetPinRateLimit()
  let upstreamCalled = false
  const upstream = http.createServer((req, res) => {
    upstreamCalled = true
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ settings: 'ok' }))
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  const upstreamPort = upstream.address().port

  const bridgePort = 31981
  const stop = startDirectBridge(
    { webServer: { port: upstreamPort } },
    {
      hosts: ['127.0.0.1'],
      port: bridgePort,
      unlockPrivileged: true,
      lanPin: '4321',
      log: () => {},
    }
  )

  try {
    const res = await fetch(`http://127.0.0.1:${bridgePort}/api/settings.describe`, {
      headers: { 'x-dsh-lan-pin': '4321' },
    })
    assert.equal(res.status, 200)
    assert.equal(upstreamCalled, true)
    const json = await res.json()
    assert.equal(json.settings, 'ok')
  } finally {
    resetPinRateLimit()
    await stop()
    await new Promise((r) => upstream.close(r))
  }
})

test('Issue #155: registerMobileQrTool registers agent tool /mobileqr', async () => {
  let registeredTool = null
  const mockCtx = {
    inject: (deps, fn) => {
      assert.deepEqual(deps, ['tools'])
      fn({
        tools: {
          register: (tool) => {
            registeredTool = tool
          },
        },
      })
    },
    webServer: { port: 3088 },
  }
  const state = {
    listener: { scheme: 'http', port: 3088 },
    mdnsName: 'dsh.local',
  }

  registerMobileQrTool(mockCtx, state)
  assert.ok(registeredTool, 'tool was registered')
  assert.equal(registeredTool.name, 'mobileqr')
  assert.match(registeredTool.description, /instant smartphone or tablet login/i)

  // Execute tool
  const result = await registeredTool.execute()
  assert.ok(result && Array.isArray(result.content))
  assert.equal(result.content.length, 2)
  assert.match(result.content[0].text, /Mobile LAN Connection/)
  assert.match(result.content[1].text, /<svg/)
})

test('Issue #156: tunnelPin enforces PIN for Cloudflare WAN tunnel requests', async () => {
  resetPinRateLimit()
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('public-content')
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  const upstreamPort = upstream.address().port

  const bridgePort = 31982
  const stop = startDirectBridge(
    { webServer: { port: upstreamPort } },
    {
      hosts: ['127.0.0.1'],
      port: bridgePort,
      tunnelPin: true,
      lanPin: '7777',
      log: () => {},
    }
  )

  try {
    // 1. Regular LAN request without cf-ray -> passes through
    const resLan = await fetch(`http://127.0.0.1:${bridgePort}/public-page`)
    assert.equal(resLan.status, 200)

    // 2. Request via Cloudflare tunnel (cf-ray header) without PIN -> 403 PIN required
    const resCfNoPin = await fetch(`http://127.0.0.1:${bridgePort}/public-page`, {
      headers: { 'cf-ray': '8bd927f8a812-DME' },
    })
    assert.equal(resCfNoPin.status, 403)
    assert.equal(resCfNoPin.headers.get('x-dsh-lan-pin-required'), '1')

    // 3. Request via Cloudflare tunnel with valid PIN -> 200 OK
    const resCfWithPin = await fetch(`http://127.0.0.1:${bridgePort}/public-page`, {
      headers: {
        'cf-ray': '8bd927f8a812-DME',
        'x-dsh-lan-pin': '7777',
      },
    })
    assert.equal(resCfWithPin.status, 200)
    assert.equal(await resCfWithPin.text(), 'public-content')
  } finally {
    resetPinRateLimit()
    await stop()
    await new Promise((r) => upstream.close(r))
  }
})

test('Issue #157: passwordAuth protects interfaces and telemetry endpoints', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('upstream')
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  const upstreamPort = upstream.address().port

  const authManager = new AuthManager({
    jwtSecret: 'test-secret-at-least-32-characters-long-key',
    sessionDays: 1,
  })

  const bridgePort = 31983
  const stop = startDirectBridge(
    { webServer: { port: upstreamPort } },
    {
      hosts: ['127.0.0.1'],
      port: bridgePort,
      passwordAuth: true,
      authManager,
      log: () => {},
    }
  )

  try {
    // 1. Unauthenticated request to /dsh-lanmode/api/interfaces -> 401
    const resIfacesNoAuth = await fetch(`http://127.0.0.1:${bridgePort}/dsh-lanmode/api/interfaces`)
    assert.equal(resIfacesNoAuth.status, 401)
    assert.equal(resIfacesNoAuth.headers.get('x-dsh-auth-required'), '1')

    // 2. Unauthenticated request to /dsh-lanmode/api/telemetry -> 401
    const resTelemNoAuth = await fetch(`http://127.0.0.1:${bridgePort}/dsh-lanmode/api/telemetry`)
    assert.equal(resTelemNoAuth.status, 401)
    assert.equal(resTelemNoAuth.headers.get('x-dsh-auth-required'), '1')

    // 3. Authenticated request with session cookie -> 200
    const session = authManager.createSession('admin', { socket: { remoteAddress: '127.0.0.1' }, headers: {} })
    const resIfacesAuth = await fetch(`http://127.0.0.1:${bridgePort}/dsh-lanmode/api/interfaces`, {
      headers: { cookie: `dsh_auth_session=${session.token}` },
    })
    assert.equal(resIfacesAuth.status, 200)
    const ifaces = await resIfacesAuth.json()
    assert.ok(Array.isArray(ifaces))

    const resTelemAuth = await fetch(`http://127.0.0.1:${bridgePort}/dsh-lanmode/api/telemetry`, {
      headers: { cookie: `dsh_auth_session=${session.token}` },
    })
    assert.equal(resTelemAuth.status, 200)
    const telem = await resTelemAuth.json()
    assert.ok(telem.keepAlivePool)
  } finally {
    await stop()
    await new Promise((r) => upstream.close(r))
  }
})
