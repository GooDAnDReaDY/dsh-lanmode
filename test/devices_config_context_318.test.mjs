import test from 'node:test'
import assert from 'node:assert/strict'
import { registerDeviceRoutes } from '../lib/routes/devices.js'

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

test('Issue #318: device routes pass state and config to isTrustedSameOrigin', async () => {
  const routes = {}
  const mockCtx = {
    effect(fn) { fn() },
    webServer: {
      register(r) { routes[r.path] = r },
    },
  }

  let capturedOptions = null
  const mockConfig = { allowedHosts: ['custom.example.local'] }
  const mockState = { adminRules: [] }

  registerDeviceRoutes(mockCtx, {
    state: mockState,
    config: mockConfig,
    deviceRegistry: {
      setNickname: () => true,
      revoke: () => true,
      revokeAll: () => {},
    },
    resolveClientRole: () => 'admin',
    verifyAdminAccess: () => ({ ok: true }),
    isTrustedSameOrigin: (req, opts) => {
      capturedOptions = opts
      return true
    },
  })

  // Test nickname route
  const req = {
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    on(event, handler) {
      if (event === 'data') handler(Buffer.from(JSON.stringify({ id: 'dev1', nickname: 'phone' })))
      if (event === 'end') handler()
    },
  }
  const res = createMockRes()
  routes['/dsh-lanmode/devices/nickname'].handler(req, res)

  await new Promise((r) => setTimeout(r, 20))
  assert.ok(capturedOptions, 'isTrustedSameOrigin was called with options')
  assert.equal(capturedOptions.config, mockConfig)
  assert.equal(capturedOptions.state, mockState)
})
