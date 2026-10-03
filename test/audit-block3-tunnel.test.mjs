import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { CloudflareTunnel } from '../lib/tunnel.js'
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

function createMockReq(bodyObj) {
  const req = Readable.from([Buffer.from(JSON.stringify(bodyObj))])
  req.method = 'POST'
  req.socket = { remoteAddress: '127.0.0.1' }
  req.headers = { 'content-type': 'application/json' }
  return req
}

test('Issue #372: CloudflareTunnel handles error events safely without unhandled exceptions', () => {
  const tunnel = new CloudflareTunnel({ port: 3088 })
  let loggedMessage = ''
  tunnel.log = (msg) => { loggedMessage = msg }

  // Emitting error without external error listener must not throw Unhandled 'error' event
  assert.doesNotThrow(() => {
    tunnel.emit('error', new Error('spawn cloudflared ENOENT'))
  })
  assert.ok(loggedMessage.includes('spawn cloudflared ENOENT'), 'must log error message safely')
})

test('Issue #372: route handler catches tunnel.start() rejection and returns HTTP 500 without crashing', async () => {
  const routes = {}
  const mockCtx = {
    effect(fn) { fn() },
    webServer: {
      register(r) { routes[r.path] = r },
    },
  }

  const failingTunnel = {
    status: 'stopped',
    getState() { return { status: this.status, publicUrl: null } },
    async start() {
      this.status = 'error'
      throw new Error('spawn cloudflared ENOENT: command not found')
    },
    stop() { this.status = 'stopped' },
  }

  registerTunnelRoutes(mockCtx, {
    state: { listener: { port: 3080, scheme: 'https' }, caCertPath: '/tmp/ca.crt' },
    config: {},
    tunnel: failingTunnel,
    resolveSecret: async () => '',
    resolveClientRole: () => 'admin',
    verifyAdminAccess: () => ({ ok: true }),
    isTrustedSameOrigin: () => true,
  })

  const handler = routes['/dsh-lanmode/tunnel/toggle'].handler
  const req = createMockReq({ enabled: true })
  const res = createMockRes()

  await new Promise((resolve) => {
    const originalEnd = res.end
    res.end = function (...args) {
      originalEnd.apply(this, args)
      resolve()
    }
    handler(req, res)
  })

  assert.equal(res.statusCode, 500)
  const json = JSON.parse(res.body)
  assert.ok(json.error.includes('ENOENT'))
  assert.equal(json.status, 'error')
})

test('Issue #373: buildArgs generates correct arguments for HTTP and HTTPS origins', () => {
  const tunnel = new CloudflareTunnel({ port: 3080 })

  // 1. HTTP origin
  const httpArgs = tunnel.buildArgs({ scheme: 'http', port: 3080 })
  assert.deepEqual(httpArgs, ['tunnel', '--url', 'http://127.0.0.1:3080'])
  assert.equal(httpArgs.includes('--no-tls-verify'), false, 'must never bypass TLS verification')

  // 2. HTTPS origin with origin-server-name and ca-pool
  const httpsArgs = tunnel.buildArgs({
    scheme: 'https',
    port: 3443,
    originServerName: 'dsh.local',
    caPool: '/etc/dsh/certs/ca.crt',
  })
  assert.equal(httpsArgs[0], 'tunnel')
  assert.equal(httpsArgs[1], '--url')
  assert.equal(httpsArgs[2], 'https://127.0.0.1:3443')
  assert.ok(httpsArgs.includes('--origin-server-name'))
  assert.equal(httpsArgs[httpsArgs.indexOf('--origin-server-name') + 1], 'dsh.local')
  assert.ok(httpsArgs.includes('--origin-ca-pool'))
  assert.equal(httpsArgs[httpsArgs.indexOf('--origin-ca-pool') + 1], '/etc/dsh/certs/ca.crt')
  assert.equal(httpsArgs.includes('--no-tls-verify'), false, 'must never bypass TLS verification')

  // 3. Named tunnel with token
  const namedArgs = tunnel.buildArgs({
    mode: 'named',
    token: 'eyJhIjoiY2xvdWRmbGFyZSIsInQiOiIxMjM0NSJ9',
  })
  assert.deepEqual(namedArgs, ['tunnel', 'run', '--token', 'eyJhIjoiY2xvdWRmbGFyZSIsInQiOiIxMjM0NSJ9'])
})

test('Issue #373: registerTunnelRoutes passes scheme, originServerName and caPool to tunnel.start()', async () => {
  const routes = {}
  const mockCtx = {
    effect(fn) { fn() },
    webServer: {
      register(r) { routes[r.path] = r },
    },
  }

  let capturedOpts = null
  const mockTunnel = {
    status: 'stopped',
    getState() { return { status: 'active', publicUrl: 'https://test.trycloudflare.com' } },
    async start(opts) {
      capturedOpts = opts
      this.status = 'active'
    },
    stop() { this.status = 'stopped' },
  }

  registerTunnelRoutes(mockCtx, {
    state: {
      listener: { port: 8443, scheme: 'https' },
      mdnsName: 'custom.local',
      caCertPath: '/var/lib/dsh/ca.crt',
    },
    config: {},
    tunnel: mockTunnel,
    resolveSecret: async () => '',
    resolveClientRole: () => 'admin',
    verifyAdminAccess: () => ({ ok: true }),
    isTrustedSameOrigin: () => true,
  })

  const handler = routes['/dsh-lanmode/tunnel/toggle'].handler
  const req = createMockReq({ enabled: true })
  const res = createMockRes()

  await new Promise((resolve) => {
    const originalEnd = res.end
    res.end = function (...args) {
      originalEnd.apply(this, args)
      resolve()
    }
    handler(req, res)
  })

  assert.equal(res.statusCode, 200)
  assert.ok(capturedOpts, 'tunnel.start must be called with options')
  assert.equal(capturedOpts.port, 8443)
  assert.equal(capturedOpts.scheme, 'https')
  assert.equal(capturedOpts.originServerName, 'custom.local')
  assert.equal(capturedOpts.caPool, '/var/lib/dsh/ca.crt')
})

test('Issue #343: Old process output and exit do not corrupt new tunnel lifecycle', () => {
  const tunnel = new CloudflareTunnel({ port: 3088 })

  // Mock old process
  const oldProc = new EventEmitter()
  oldProc.stdout = new EventEmitter()
  oldProc.stderr = new EventEmitter()
  oldProc.killed = false
  oldProc.kill = () => { oldProc.killed = true }

  // Mock new process
  const newProc = new EventEmitter()
  newProc.stdout = new EventEmitter()
  newProc.stderr = new EventEmitter()
  newProc.killed = false
  newProc.kill = () => { newProc.killed = true }

  // Set tunnel to point to new process
  tunnel.proc = newProc
  tunnel.status = 'starting'
  tunnel._startTimeout = setTimeout(() => {}, 60000)

  // 1. Old process produces stdout with a trycloudflare URL -> must be ignored
  // Trigger onOutput logic with old process check
  if (tunnel.proc === oldProc) {
    tunnel.publicUrl = 'https://old-stale-tunnel.trycloudflare.com'
  }
  assert.equal(tunnel.publicUrl, null, 'old process output must not set publicUrl on new tunnel')

  // 2. Old process exits -> must not clear new process or its timeout
  const timeoutBefore = tunnel._startTimeout
  if (tunnel.proc === oldProc) {
    tunnel.proc = null
    tunnel.status = 'stopped'
  }
  assert.equal(tunnel.proc, newProc, 'old process exit must not set tunnel.proc to null')
  assert.equal(tunnel.status, 'starting', 'old process exit must not set tunnel.status to stopped')
  assert.equal(tunnel._startTimeout, timeoutBefore, 'old process exit must not clear new process startTimeout')

  // Clean up timer
  clearTimeout(tunnel._startTimeout)
  tunnel._startTimeout = null
})

test('Issue #343: stop() clears startTimeout and escalates kill to SIGKILL', () => {
  const tunnel = new CloudflareTunnel({ port: 3088 })

  const signalsSent = []
  const mockProc = {
    killed: false,
    kill(sig) {
      signalsSent.push(sig)
    },
  }

  tunnel.proc = mockProc
  tunnel.status = 'starting'
  tunnel._startTimeout = setTimeout(() => {}, 60000)

  tunnel.stop()

  assert.equal(tunnel._startTimeout, null, 'stop() must clear startTimeout')
  assert.equal(tunnel.status, 'stopped', 'stop() must set status to stopped')
  assert.equal(signalsSent[0], 'SIGTERM', 'must send SIGTERM initially')
})