import test from 'node:test'
import assert from 'node:assert/strict'
import { handleBridgeLocalRoutes } from '../lib/bridge-local.js'

function createMockReqRes({ method = 'GET', url = '/dsh-lanmode/qr', headers = {} } = {}) {
  const req = {
    method,
    url,
    headers: { host: '127.0.0.1:3080', ...headers },
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

const mockDeps = {
  options: { port: 3080, tls: false },
  authManager: null,
  isPasswordAuth: () => false,
  version: '0.8.8',
  hosts: ['127.0.0.1'],
  upstreamAgent: { sockets: {}, freeSockets: {}, requests: {} },
  upstreamStreamAgent: { sockets: {}, freeSockets: {}, requests: {} },
  activeConnections: 0,
  totalBytesSent: 0,
  totalBytesReceived: 0,
  deviceRegistry: null,
  remote: '127.0.0.1',
  role: 'admin',
  currentToken: () => 'test-token-123',
  denyUnlessAdmin: () => true,
}

test('Issue #322 (#GH-2): GET /dsh-lanmode/qr generates valid SVG and does not crash with undefined cached.svg', () => {
  const { req, res } = createMockReqRes({ method: 'GET', url: '/dsh-lanmode/qr' })
  const handled = handleBridgeLocalRoutes(req, res, mockDeps)

  assert.equal(handled, true, 'Route should be handled')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['Content-Type'], 'image/svg+xml; charset=utf-8')
  assert.ok(res.headers['Content-Length'] > 0)
  assert.ok(res.headers['ETag'] && res.headers['ETag'].startsWith('W/"'))
  assert.ok(res.body.includes('<svg'))
  assert.equal(res.headers['Content-Length'], Buffer.byteLength(res.body, 'utf8'))
})

test('Issue #322 (#GH-2): HEAD /dsh-lanmode/qr returns headers without body', () => {
  const { req, res } = createMockReqRes({ method: 'HEAD', url: '/dsh-lanmode/qr' })
  const handled = handleBridgeLocalRoutes(req, res, mockDeps)

  assert.equal(handled, true)
  assert.equal(res.statusCode, 200)
  assert.ok(res.headers['Content-Length'] > 0)
  assert.equal(res.body, '')
})

test('Issue #322 (#GH-2): If-None-Match returns 304 with matching ETag', () => {
  const { req: r1, res: res1 } = createMockReqRes({ method: 'GET', url: '/dsh-lanmode/qr' })
  handleBridgeLocalRoutes(r1, res1, mockDeps)
  const etag = res1.headers['ETag']

  const { req: r2, res: res2 } = createMockReqRes({
    method: 'GET',
    url: '/dsh-lanmode/qr',
    headers: { 'if-none-match': etag },
  })
  handleBridgeLocalRoutes(r2, res2, mockDeps)

  assert.equal(res2.statusCode, 304)
  assert.equal(res2.headers['ETag'], etag)
  assert.equal(res2.body, '')
})

test('Issue #322 (#GH-2): non-GET/HEAD method returns 405 Method Not Allowed with Allow header', () => {
  const { req, res } = createMockReqRes({ method: 'POST', url: '/dsh-lanmode/qr' })
  const handled = handleBridgeLocalRoutes(req, res, mockDeps)

  assert.equal(handled, true)
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers['allow'], 'GET, HEAD')
})

test('Issue #322 (#GH-2): oversized target URL returns 400 Bad Request without crashing process', () => {
  const giantUrl = 'http://example.com/' + 'a'.repeat(4000)
  const { req, res } = createMockReqRes({ method: 'GET', url: `/dsh-lanmode/qr?url=${giantUrl}` })
  const handled = handleBridgeLocalRoutes(req, res, mockDeps)

  assert.equal(handled, true)
  assert.equal(res.statusCode, 400)
  assert.ok(res.body.includes('failed generating QR'))
})
