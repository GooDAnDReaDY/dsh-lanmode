import test from 'node:test'
import assert from 'node:assert/strict'
import { registerDeviceRoutes } from '../lib/routes/devices.js'

function createMockReqRes({ method = 'POST', url = '/dsh-lanmode/devices/revoke', body = '' } = {}) {
  const req = {
    method,
    url,
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '127.0.0.1' },
    _body: body,
    on(event, handler) {
      if (event === 'data') {
        if (this._body) handler(Buffer.from(this._body))
      }
      if (event === 'end') {
        process.nextTick(handler)
      }
      return this
    },
  }

  let statusCode = 0
  let responseHeaders = {}
  let bodyChunks = []

  const res = {
    writeHead(code, hdrs) {
      statusCode = code
      responseHeaders = hdrs || {}
    },
    end(chunk) {
      if (chunk !== undefined) {
        bodyChunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
      }
    },
    get statusCode() { return statusCode },
    get headers() { return responseHeaders },
    get body() { return Buffer.concat(bodyChunks).toString('utf8') },
  }

  return { req, res }
}

test('Issue #326: /dsh-lanmode/devices/revoke validates body shape and rejects missing device id', async () => {
  const routes = new Map()
  const mockCtx = {
    effect: (fn) => fn(),
    webServer: {
      register: (spec) => {
        routes.set(spec.path, spec.handler)
      },
    },
  }

  let revokedId = null
  const mockDeviceRegistry = {
    revoke: (id) => {
      revokedId = id
      return true
    },
    list: () => [],
    setNickname: () => true,
    revokeAll: () => true,
  }

  registerDeviceRoutes(mockCtx, {
    state: {},
    config: {},
    deviceRegistry: mockDeviceRegistry,
    resolveSecret: () => '',
    resolveClientRole: () => 'admin',
    verifyAdminAccess: () => ({ ok: true }),
    isTrustedSameOrigin: () => true,
  })

  const handler = routes.get('/dsh-lanmode/devices/revoke')
  assert.ok(handler, 'revoke route must be registered')

  // 1. Missing ID (empty object)
  const { req: r1, res: res1 } = createMockReqRes({ body: '{}' })
  handler(r1, res1)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(res1.statusCode, 400)
  assert.ok(res1.body.includes('Device ID required'))
  assert.equal(revokedId, null)

  // 2. Non-object payload
  const { req: r2, res: res2 } = createMockReqRes({ body: '123' })
  handler(r2, res2)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(res2.statusCode, 400)
  assert.ok(res2.body.includes('Device ID required'))

  // 3. Valid payload
  const { req: r3, res: res3 } = createMockReqRes({ body: JSON.stringify({ id: 'target-device-99' }) })
  handler(r3, res3)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(res3.statusCode, 200)
  assert.equal(JSON.parse(res3.body).ok, true)
  assert.equal(revokedId, 'target-device-99')
})
