import test from 'node:test'
import assert from 'node:assert/strict'
import { handleBridgeLocalRoutes } from '../lib/bridge-local.js'

function createMockReqRes({ method = 'GET', url = '/dsh-lanmode/api/interfaces' } = {}) {
  const req = {
    method,
    url,
    headers: { host: '127.0.0.1:3080' },
    socket: { remoteAddress: '127.0.0.1' },
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

const mockAuthManager = {
  extractToken: () => 'token-123',
  validateSession: () => ({ user: 'admin' }),
}

test('Issue #323: /dsh-lanmode/api/interfaces blocks unauthenticated guest and accepts admin', () => {
  // 1. Unauthenticated guest
  const { req: r1, res: res1 } = createMockReqRes({ method: 'GET', url: '/dsh-lanmode/api/interfaces' })
  const mockDepsGuest = {
    options: { port: 3080 },
    hosts: ['127.0.0.1'],
    upstreamAgent: {},
    upstreamStreamAgent: {},
    denyUnlessAdmin: (req, res) => {
      res.writeHead(403, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Admin access required' }))
      return false
    },
    isPasswordAuth: () => true,
    authManager: mockAuthManager,
    remote: '192.168.1.50',
    role: 'guest',
  }
  const handledGuest = handleBridgeLocalRoutes(r1, res1, mockDepsGuest)
  assert.equal(handledGuest, true)
  assert.equal(res1.statusCode, 403)
  assert.ok(res1.body.includes('Admin access required'))

  // 2. Admin
  const { req: r2, res: res2 } = createMockReqRes({ method: 'GET', url: '/dsh-lanmode/api/interfaces' })
  const mockDepsAdmin = {
    ...mockDepsGuest,
    denyUnlessAdmin: () => true,
    role: 'admin',
  }
  const handledAdmin = handleBridgeLocalRoutes(r2, res2, mockDepsAdmin)
  assert.equal(handledAdmin, true)
  assert.equal(res2.statusCode, 200)
  assert.ok(res2.body.includes('interfaces') || res2.body.includes('[]') || res2.body.includes('{'))

  // 3. Invalid method (POST)
  const { req: r3, res: res3 } = createMockReqRes({ method: 'POST', url: '/dsh-lanmode/api/interfaces' })
  const handledPost = handleBridgeLocalRoutes(r3, res3, mockDepsAdmin)
  assert.equal(handledPost, true)
  assert.equal(res3.statusCode, 405)
  assert.equal(res3.headers['allow'], 'GET, HEAD')
})

test('Issue #323: /dsh-lanmode/api/telemetry blocks unauthenticated guest and accepts admin', () => {
  // 1. Unauthenticated guest
  const { req: r1, res: res1 } = createMockReqRes({ method: 'GET', url: '/dsh-lanmode/api/telemetry' })
  const mockDepsGuest = {
    options: { port: 3080 },
    hosts: ['127.0.0.1'],
    upstreamAgent: { sockets: {}, freeSockets: {}, requests: {} },
    upstreamStreamAgent: { sockets: {}, freeSockets: {}, requests: {} },
    activeConnections: 0,
    totalBytesSent: 0,
    totalBytesReceived: 0,
    denyUnlessAdmin: (req, res) => {
      res.writeHead(403, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Admin access required' }))
      return false
    },
    isPasswordAuth: () => true,
    authManager: mockAuthManager,
    remote: '192.168.1.50',
    role: 'guest',
  }
  const handledGuest = handleBridgeLocalRoutes(r1, res1, mockDepsGuest)
  assert.equal(handledGuest, true)
  assert.equal(res1.statusCode, 403)
  assert.ok(res1.body.includes('Admin access required'))

  // 2. Admin
  const { req: r2, res: res2 } = createMockReqRes({ method: 'GET', url: '/dsh-lanmode/api/telemetry' })
  const mockDepsAdmin = {
    ...mockDepsGuest,
    denyUnlessAdmin: () => true,
    role: 'admin',
  }
  const handledAdmin = handleBridgeLocalRoutes(r2, res2, mockDepsAdmin)
  assert.equal(handledAdmin, true)
  assert.equal(res2.statusCode, 200)
  const data = JSON.parse(res2.body)
  assert.ok('uptime' in data)
  assert.ok('keepAlivePool' in data)

  // 3. Invalid method (POST)
  const { req: r3, res: res3 } = createMockReqRes({ method: 'POST', url: '/dsh-lanmode/api/telemetry' })
  const handledPost = handleBridgeLocalRoutes(r3, res3, mockDepsAdmin)
  assert.equal(handledPost, true)
  assert.equal(res3.statusCode, 405)
  assert.equal(res3.headers['allow'], 'GET, HEAD')
})
