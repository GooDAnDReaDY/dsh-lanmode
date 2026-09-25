import test from 'node:test'
import assert from 'node:assert/strict'
import { registerDiagnosticsRoutes } from '../lib/routes/diagnostics.js'

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

test('Issue #311: Diagnostics routes reject non-GET/HEAD methods with 405 Method Not Allowed', () => {
  const registered = []
  const mockCtx = {
    effect(fn) {
      fn()
    },
    webServer: {
      register(route) {
        registered.push(route)
      },
    },
  }

  registerDiagnosticsRoutes(mockCtx, {
    state: {},
    config: {},
    certificateDir: () => '/fake/dir',
    readRootCA: () => null,
    hostReport: () => ({ ok: true }),
    healthPage: () => '<html></html>',
    generateCachedQRSvg: () => '<svg></svg>',
  })

  assert.equal(registered.length, 5)

  for (const route of registered) {
    // Test POST
    const postReq = { method: 'POST', url: route.path, headers: {} }
    const postRes = createMockRes()
    route.handler(postReq, postRes)
    assert.equal(postRes.statusCode, 405, `POST ${route.path} should return 405`)
    assert.equal(postRes.headers['allow'], 'GET, HEAD')
    assert.equal(postRes.body, 'Method Not Allowed')

    // Test DELETE
    const delReq = { method: 'DELETE', url: route.path, headers: {} }
    const delRes = createMockRes()
    route.handler(delReq, delRes)
    assert.equal(delRes.statusCode, 405, `DELETE ${route.path} should return 405`)
    assert.equal(delRes.headers['allow'], 'GET, HEAD')

    // Test GET (should NOT return 405)
    const getReq = { method: 'GET', url: route.path, headers: {} }
    const getRes = createMockRes()
    route.handler(getReq, getRes)
    assert.notEqual(getRes.statusCode, 405, `GET ${route.path} should not return 405`)
  }
})
