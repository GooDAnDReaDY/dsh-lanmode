import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { verifyAdminAccess, isTrustedSameOrigin } from '../lib/access.js'
import { AuthManager, makeSessionCookie } from '../lib/auth.js'
import { DeviceRegistry } from '../lib/devices.js'

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

test('Issue #142: verifyAdminAccess unit checks', () => {
  const authManager = new AuthManager()
  const state = { authManager, passwordAuth: true }
  const config = { passwordAuth: true }

  // 1. Role guest/denied -> 403
  const guestResult = verifyAdminAccess({ method: 'GET', headers: {} }, { state, config, clientIp: '127.0.0.1', role: 'guest' })
  assert.equal(guestResult.ok, false)
  assert.equal(guestResult.status, 403)

  const deniedResult = verifyAdminAccess({ method: 'GET', headers: {} }, { state, config, clientIp: '127.0.0.1', role: 'denied' })
  assert.equal(deniedResult.ok, false)
  assert.equal(deniedResult.status, 403)

  // 2. Cross-site POST -> 403
  const crossSiteReq = { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }
  const csrfResult = verifyAdminAccess(crossSiteReq, { state, config, clientIp: '127.0.0.1', role: 'admin' })
  assert.equal(csrfResult.ok, false)
  assert.equal(csrfResult.status, 403)
  assert.ok(csrfResult.error.includes('Cross-site request rejected'))

  // 3. PasswordAuth enabled, missing session -> 401
  const noSessionReq = { method: 'GET', headers: {} }
  const noSessionResult = verifyAdminAccess(noSessionReq, { state, config, clientIp: '127.0.0.1', role: 'admin' })
  assert.equal(noSessionResult.ok, false)
  assert.equal(noSessionResult.status, 401)
  assert.ok(noSessionResult.error.includes('Authentication required'))

  // 4. PasswordAuth enabled, valid session -> ok: true
  const session = authManager.createSession('admin', { socket: { remoteAddress: '127.0.0.1' } })
  const validReq = { method: 'GET', headers: { cookie: `dsh_auth_session=${session.token}` } }
  const validResult = verifyAdminAccess(validReq, { state, config, clientIp: '127.0.0.1', role: 'admin' })
  assert.equal(validResult.ok, true)
  assert.ok(validResult.session)

  // 5. PasswordAuth disabled, loopback access -> ok: true
  const noAuthLocal = verifyAdminAccess({ method: 'GET', headers: {} }, { state: { passwordAuth: false }, config: { passwordAuth: false }, clientIp: '127.0.0.1', role: 'admin' })
  assert.equal(noAuthLocal.ok, true)

  // 6. PasswordAuth disabled, non-loopback guest access -> 403
  const noAuthGuest = verifyAdminAccess({ method: 'GET', headers: {} }, { state: { passwordAuth: false }, config: { passwordAuth: false }, clientIp: '192.168.1.50', role: 'guest' })
  assert.equal(noAuthGuest.ok, false)
  assert.equal(noAuthGuest.status, 403)
})

test('Issue #142 & #132: Direct webServer route invocation without session fails closed', async () => {
  const authManager = new AuthManager()
  const deviceRegistry = new DeviceRegistry()
  const state = {
    authManager,
    deviceRegistry,
    passwordAuth: true,
    rules: [],
    adminRules: [],
    guestRules: [],
  }
  const config = { passwordAuth: true }

  // Register endpoints in a test HTTP server mimicking DSH webServer
  const server = http.createServer((req, res) => {
    const ip = req.socket.remoteAddress || ''
    const role = 'admin' // Even if role resolves to admin, lack of session must reject

    if (req.url === '/dsh-lanmode/devices/revoke') {
      if (req.method !== 'POST') { res.writeHead(405).end(); return }
      const auth = verifyAdminAccess(req, { state, config, clientIp: ip, role })
      if (!auth.ok) {
        res.writeHead(auth.status, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: auth.error }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }))
      return
    }

    if (req.url === '/dsh-lanmode/devices/kill-all') {
      if (req.method !== 'POST') { res.writeHead(405).end(); return }
      const auth = verifyAdminAccess(req, { state, config, clientIp: ip, role })
      if (!auth.ok) {
        res.writeHead(auth.status, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: auth.error }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }))
      return
    }

    if (req.url === '/dsh-lanmode/tunnel/toggle') {
      if (req.method !== 'POST') { res.writeHead(405).end(); return }
      const auth = verifyAdminAccess(req, { state, config, clientIp: ip, role })
      if (!auth.ok) {
        res.writeHead(auth.status, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: auth.error }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }))
      return
    }

    if (req.url === '/dsh-lanmode/devices') {
      const auth = verifyAdminAccess(req, { state, config, clientIp: ip, role })
      if (!auth.ok) {
        res.writeHead(auth.status, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: auth.error }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(deviceRegistry.list()))
      return
    }

    res.writeHead(404).end()
  })

  const port = await listen(server)

  try {
    // 1. Direct unauthenticated POST to /devices/revoke -> 401
    const revokeRes = await fetch(`http://127.0.0.1:${port}/dsh-lanmode/devices/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'some-id' }),
    })
    assert.equal(revokeRes.status, 401)
    const revokeJson = await revokeRes.json()
    assert.ok(revokeJson.error.includes('Authentication required'))

    // 2. Direct unauthenticated POST to /devices/kill-all -> 401
    const killRes = await fetch(`http://127.0.0.1:${port}/dsh-lanmode/devices/kill-all`, {
      method: 'POST',
    })
    assert.equal(killRes.status, 401)

    // 3. Direct unauthenticated POST to /tunnel/toggle -> 401
    const toggleRes = await fetch(`http://127.0.0.1:${port}/dsh-lanmode/tunnel/toggle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    })
    assert.equal(toggleRes.status, 401)

    // 4. Direct unauthenticated GET to /devices -> 401
    const devRes = await fetch(`http://127.0.0.1:${port}/dsh-lanmode/devices`)
    assert.equal(devRes.status, 401)

    // 5. With valid session cookie -> 200 OK
    const session = authManager.createSession('admin', { socket: { remoteAddress: '127.0.0.1' } })
    const authDevRes = await fetch(`http://127.0.0.1:${port}/dsh-lanmode/devices`, {
      headers: { cookie: `dsh_auth_session=${session.token}` },
    })
    assert.equal(authDevRes.status, 200)

    const authKillRes = await fetch(`http://127.0.0.1:${port}/dsh-lanmode/devices/kill-all`, {
      method: 'POST',
      headers: { cookie: `dsh_auth_session=${session.token}` },
    })
    assert.equal(authKillRes.status, 200)
  } finally {
    server.close()
  }
})
