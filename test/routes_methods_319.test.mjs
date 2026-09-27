import test from 'node:test'
import assert from 'node:assert/strict'
import { registerPwaManifestRoute } from '../lib/pwa-manifest.js'
import { registerDeviceRoutes } from '../lib/routes/devices.js'
import { registerConfigApi } from '../lib/routes/config.js'

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

test('Issue #319: routes enforce 405 Method Not Allowed and RFC 9110 Allow headers', () => {
  const routes = {}
  const mockCtx = {
    effect(fn) { fn() },
    webServer: {
      register(r) { routes[r.path] = r },
    },
  }

  // 1. PWA manifest
  registerPwaManifestRoute(mockCtx)
  const manifestHandler = routes['/manifest.webmanifest'].handler
  const postManifest = createMockRes()
  manifestHandler({ method: 'POST' }, postManifest)
  assert.equal(postManifest.statusCode, 405)
  assert.equal(postManifest.headers['allow'], 'GET, HEAD')

  // 2. Devices roster
  registerDeviceRoutes(mockCtx, {
    state: {},
    config: {},
    deviceRegistry: { list: () => [] },
    resolveClientRole: () => 'admin',
    verifyAdminAccess: () => ({ ok: true }),
    isTrustedSameOrigin: () => true,
  })
  const devicesHandler = routes['/dsh-lanmode/devices'].handler
  const postDevices = createMockRes()
  devicesHandler({ method: 'POST', socket: { remoteAddress: '127.0.0.1' } }, postDevices)
  assert.equal(postDevices.statusCode, 405)
  assert.equal(postDevices.headers['allow'], 'GET, HEAD')

  // 3. Config API
  registerConfigApi(mockCtx, {}, null, { state: { adminRules: [] } })
  const configHandler = routes['/dsh-lanmode/api/config'].handler
  const putConfig = createMockRes()
  configHandler({ method: 'PUT', socket: { remoteAddress: '127.0.0.1' } }, putConfig)
  assert.equal(putConfig.statusCode, 405)
  assert.equal(putConfig.headers['allow'], 'GET, HEAD, PATCH')
})
