import test from 'node:test'
import assert from 'node:assert/strict'
import { registerTunnelRoutes } from '../lib/routes/tunnel.js'

function createMockRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(code, headers = {}) {
      this.statusCode = code
      this.headers = headers
      return this
    },
    end(data = '') {
      this.body = data
    },
  }
}

test('Issue #316: GET /dsh-lanmode/tunnel enforces admin verification and method check', () => {
  const routes = {}
  const mockCtx = {
    effect(fn) { fn() },
    webServer: {
      register(r) { routes[r.path] = r },
    },
  }

  const mockTunnel = {
    getState() {
      return { status: 'active', publicUrl: 'https://secret.trycloudflare.com', mode: 'quick' }
    },
  }

  registerTunnelRoutes(mockCtx, {
    state: {},
    config: {},
    tunnel: mockTunnel,
    resolveClientRole: (ip) => (ip === '127.0.0.1' ? 'admin' : 'guest'),
    verifyAdminAccess: (req, { role }) => {
      if (role !== 'admin') return { ok: false, status: 403, error: 'Admin only' }
      return { ok: true }
    },
    isTrustedSameOrigin: () => true,
  })

  const handler = routes['/dsh-lanmode/tunnel'].handler

  // 1. Unauthenticated / guest access -> 403
  const guestReq = { method: 'GET', socket: { remoteAddress: '192.168.1.55' } }
  const guestRes = createMockRes()
  handler(guestReq, guestRes)
  assert.equal(guestRes.statusCode, 403)
  assert.ok(guestRes.body.includes('Admin only'))

  // 2. Admin access -> 200 with tunnel state
  const adminReq = { method: 'GET', socket: { remoteAddress: '127.0.0.1' } }
  const adminRes = createMockRes()
  handler(adminReq, adminRes)
  assert.equal(adminRes.statusCode, 200)
  const json = JSON.parse(adminRes.body)
  assert.equal(json.publicUrl, 'https://secret.trycloudflare.com')

  // 3. POST method -> 405 Method Not Allowed with Allow: GET, HEAD
  const postReq = { method: 'POST', socket: { remoteAddress: '127.0.0.1' } }
  const postRes = createMockRes()
  handler(postReq, postRes)
  assert.equal(postRes.statusCode, 405)
  assert.equal(postRes.headers['allow'], 'GET, HEAD')
})
