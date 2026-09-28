import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { isAdministrativeRoute } from '../lib/access.js'
import { startDirectBridge } from '../lib/bridge.js'

test('Issue #327: isAdministrativeRoute blocks dot RPC and other plugin configs', () => {
  // Dot-notated RPC methods in DSH
  assert.equal(isAdministrativeRoute('/api/settings.update'), true)
  assert.equal(isAdministrativeRoute('/api/settings.replace'), true)
  assert.equal(isAdministrativeRoute('/api/settings.describe'), true)
  assert.equal(isAdministrativeRoute('/api/credentials.set'), true)
  assert.equal(isAdministrativeRoute('/api/credentials.describe'), true)
  assert.equal(isAdministrativeRoute('/api/plugins.install'), true)
  assert.equal(isAdministrativeRoute('/api/plugins.search'), true)

  // Other plugin config / sensitive paths
  assert.equal(isAdministrativeRoute('/dsh-voice/config'), true)
  assert.equal(isAdministrativeRoute('/dsh-test/save-key'), true)
  assert.equal(isAdministrativeRoute('/dsh-subscriptions/export'), true)
  assert.equal(isAdministrativeRoute('/dsh-auth/accounts'), true)
  assert.equal(isAdministrativeRoute('/dsh-core/vault'), true)
  assert.equal(isAdministrativeRoute('/dsh-helper/update'), true)

  // Normal non-admin paths pass
  assert.equal(isAdministrativeRoute('/api/chat'), false)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/client.js'), false)
  assert.equal(isAdministrativeRoute('/index.html'), false)
})

test('Issue #327: Bridge blocks guest role from admin RPC & plugin configs even with unlockPrivileged: true', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, upstreamReceived: req.url }))
  })
  await new Promise(r => upstream.listen(0, '127.0.0.1', r))
  const upstreamPort = upstream.address().port

  const bridge = startDirectBridge({
    webServer: { address() { return { port: upstreamPort } } }
  }, {
    hosts: ['127.0.0.1'],
    port: 0,
    adminAllow: ['127.0.0.2'],
    guestAllow: ['127.0.0.1'],
    unlockPrivileged: true,
  })

  // We need to know which port bridge listened on
  // Since options.port was 0, let's find the port or use explicit port
  await bridge()
  upstream.close()
})

test('Issue #327: Guest role gets 403 on privileged calls through bridge', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })
  await new Promise(r => upstream.listen(0, '127.0.0.1', r))
  const upstreamPort = upstream.address().port

  // Choose a random free port for bridge
  const probe = http.createServer()
  await new Promise(r => probe.listen(0, '127.0.0.1', r))
  const bridgePort = probe.address().port
  await new Promise(r => probe.close(r))

  const stop = startDirectBridge({
    webServer: { address() { return { port: upstreamPort } } }
  }, {
    hosts: ['127.0.0.1'],
    port: bridgePort,
    adminAllow: ['10.0.0.1'],
    guestAllow: ['127.0.0.1'],
    unlockPrivileged: true, // Master toggle on, but caller is guest!
  })
  await new Promise(r => setTimeout(r, 100))

  try {
    // 1. Guest -> /api/settings.update must be 403
    const res1 = await fetch(`http://127.0.0.1:${bridgePort}/api/settings.update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(res1.status, 403, 'Guest must get 403 on /api/settings.update')

    // 2. Guest -> /dsh-voice/config must be 403
    const res2 = await fetch(`http://127.0.0.1:${bridgePort}/dsh-voice/config`)
    assert.equal(res2.status, 403, 'Guest must get 403 on /dsh-*/config')

    // 3. Guest -> /api/plugins.install must be 403
    const res3 = await fetch(`http://127.0.0.1:${bridgePort}/api/plugins.install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(res3.status, 403, 'Guest must get 403 on /api/plugins.*')

    // 4. Guest -> normal allowed route passes
    const res4 = await fetch(`http://127.0.0.1:${bridgePort}/normal-page`)
    assert.equal(res4.status, 200, 'Guest can access normal routes')
  } finally {
    await stop()
    upstream.close()
  }
})
