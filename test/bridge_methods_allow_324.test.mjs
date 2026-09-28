import test from 'node:test'
import assert from 'node:assert/strict'
import { handleBridgeLocalRoutes } from '../lib/bridge-local.js'

function createMockReqRes({ method = 'GET', url = '/dsh-lanmode/sw.js' } = {}) {
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

const mockDeps = {
  options: { port: 3080 },
  hosts: ['127.0.0.1'],
  upstreamAgent: { sockets: {}, freeSockets: {}, requests: {} },
  upstreamStreamAgent: { sockets: {}, freeSockets: {}, requests: {} },
  activeConnections: 0,
  totalBytesSent: 0,
  totalBytesReceived: 0,
  denyUnlessAdmin: () => true,
  isPasswordAuth: () => false,
  authManager: null,
  remote: '127.0.0.1',
  role: 'admin',
  deviceRegistry: { list: () => [] },
}

test('Issue #324: RFC 9110 Allow headers and 405 Method Not Allowed on bridge routes', () => {
  const testCases = [
    { url: '/dsh-lanmode/pair-accept', badMethod: 'POST', allow: 'GET, HEAD' },
    { url: '/dsh-lanmode/pair-app', badMethod: 'POST', allow: 'GET, HEAD' },
    { url: '/dsh-lanmode/bans', badMethod: 'GET', allow: 'POST' },
    { url: '/dsh-lanmode/loopback-token', badMethod: 'POST', allow: 'GET, HEAD' },
    { url: '/dsh-lanmode/sw.js', badMethod: 'POST', allow: 'GET, HEAD' },
    { url: '/dsh-lanmode/ca.mobileconfig', badMethod: 'POST', allow: 'GET, HEAD' },
    { url: '/dsh-lanmode/api/devices', badMethod: 'POST', allow: 'GET, HEAD' },
    { url: '/dsh-lanmode/api/devices/revoke', badMethod: 'GET', allow: 'POST' },
    { url: '/dsh-lanmode/api/devices/revoke-others', badMethod: 'GET', allow: 'POST' },
  ]

  for (const tc of testCases) {
    const { req, res } = createMockReqRes({ method: tc.badMethod, url: tc.url })
    const handled = handleBridgeLocalRoutes(req, res, mockDeps)

    assert.equal(handled, true, `Route ${tc.url} should be handled`)
    assert.equal(res.statusCode, 405, `Route ${tc.url} should return 405 on ${tc.badMethod}`)
    assert.equal(res.headers['allow'], tc.allow, `Route ${tc.url} should have Allow: ${tc.allow}`)
  }
})
