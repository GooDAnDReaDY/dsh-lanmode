import test from 'node:test'
import assert from 'node:assert/strict'
import { registerAuthRoutes } from '../lib/routes/auth.js'

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

test('Issue #317: /dsh-lanmode/auth/logout requires POST and checks same-origin', () => {
  const routes = {}
  const mockCtx = {
    effect(fn) { fn() },
    webServer: {
      register(r) { routes[r.path] = r },
    },
  }

  let revokedToken = null
  const mockAuthManager = {
    extractToken(req) { return req.headers?.cookie?.includes('token123') ? 'token123' : null },
    revokeSession(token) { revokedToken = token },
  }

  registerAuthRoutes(mockCtx, {
    state: {},
    config: {},
    authManager: mockAuthManager,
    resolveSecret: async () => 'secret',
    makeSessionCookie: () => 'session=1',
    clearSessionCookie: () => 'dsh_auth_session=; Path=/; Max-Age=0',
    isTrustedSameOrigin: (req) => !req.headers?.origin?.includes('evil.com'),
  })

  const logoutHandler = routes['/dsh-lanmode/auth/logout'].handler

  // 1. GET method -> 405 Method Not Allowed with Allow: POST
  const getReq = { method: 'GET', headers: { cookie: 'token123' } }
  const getRes = createMockRes()
  logoutHandler(getReq, getRes)
  assert.equal(getRes.statusCode, 405)
  assert.equal(getRes.headers['allow'], 'POST')
  assert.equal(revokedToken, null, 'GET should not revoke session')

  // 2. Cross-origin POST -> 403 Forbidden
  const crossReq = { method: 'POST', headers: { cookie: 'token123', origin: 'http://evil.com' } }
  const crossRes = createMockRes()
  logoutHandler(crossReq, crossRes)
  assert.equal(crossRes.statusCode, 403)
  assert.ok(crossRes.body.includes('Cross-origin request rejected'))
  assert.equal(revokedToken, null, 'Cross-origin request should not revoke session')

  // 3. Trusted POST -> 200 OK and revokes session
  const validReq = { method: 'POST', headers: { cookie: 'token123', origin: 'http://dsh.local' } }
  const validRes = createMockRes()
  logoutHandler(validReq, validRes)
  assert.equal(validRes.statusCode, 200)
  assert.equal(revokedToken, 'token123')
  assert.ok(validRes.headers['set-cookie'].includes('Max-Age=0'))
})
