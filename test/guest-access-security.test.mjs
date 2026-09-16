import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { startDirectBridge } from '../lib/bridge.js'
import { isAdministrativeRoute, ADMINISTRATIVE_ROUTES } from '../lib/access.js'

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

test('Issue #141: isAdministrativeRoute correctly identifies all protected routes without typos', () => {
  // Real routes registered in the plugin
  assert.equal(isAdministrativeRoute('/dsh-lanmode/devices/revoke'), true)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/devices/kill-all'), true)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/api/devices/revoke-others'), true)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/tunnel/toggle'), true)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/devices'), true)
  assert.equal(isAdministrativeRoute('/api/settings'), true)
  assert.equal(isAdministrativeRoute('/api/settings/profile'), true)
  assert.equal(isAdministrativeRoute('/api/plugins'), true)

  // With query string
  assert.equal(isAdministrativeRoute('/dsh-lanmode/devices?limit=10'), true)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/tunnel/toggle?source=web'), true)

  // Public routes must NOT be flagged as administrative
  assert.equal(isAdministrativeRoute('/dsh-lanmode/health'), false)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/ca.crt'), false)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/ca.mobileconfig'), false)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/manifest.json'), false)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/qr'), false)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/probe'), false)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/auth/login'), false)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/auth/logout'), false)
  assert.equal(isAdministrativeRoute('/dsh-lanmode/auth/session'), false)
})

test('Issue #141: Guest role receives 403 on ALL administrative routes through bridge', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, url: req.url }))
  })
  const upstreamPort = await listen(upstream)

  const bridge = http.createServer()
  const bridgePort = await listen(bridge)
  bridge.close()

  const stop = startDirectBridge(
    { webServer: { port: upstreamPort } },
    {
      hosts: ['127.0.0.1'],
      port: bridgePort,
      guestAllow: ['127.0.0.0/8'],
      allow: [],
      log: () => {},
    },
  )

  await new Promise((r) => setTimeout(r, 120))

  try {
    const adminPaths = [
      '/dsh-lanmode/devices/revoke',
      '/dsh-lanmode/devices/kill-all',
      '/dsh-lanmode/api/devices/revoke-others',
      '/dsh-lanmode/tunnel/toggle',
      '/dsh-lanmode/devices',
      '/api/settings',
      '/api/plugins',
    ]

    for (const path of adminPaths) {
      const res = await fetch(`http://127.0.0.1:${bridgePort}${path}`, {
        method: path.includes('revoke') || path.includes('toggle') || path.includes('kill') ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json' },
      })
      assert.equal(res.status, 403, `Expected 403 Forbidden for guest on ${path}, got ${res.status}`)
      const body = await res.json()
      assert.ok(body.error && body.error.includes('Guest access does not permit administrative actions'))
    }

    // Harmless / regular traffic should pass through to upstream for guests
    const normalRes = await fetch(`http://127.0.0.1:${bridgePort}/chat/session`)
    assert.equal(normalRes.status, 200, 'Normal non-admin route must be accessible to guests')
  } finally {
    stop()
    upstream.close()
  }
})
