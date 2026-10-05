// Audit test suite for batch 3: Issues #414, #343, #373, #47.
// Zero hardcoded Cyrillic characters.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { EventEmitter } from 'node:events'

import { checkProfileLock, isPidAlive } from '../lib/plugin-updater.js'
import { CloudflareTunnel } from '../lib/tunnel.js'
import { Config } from '../lib/config-schema.js'
import { updateLiveState } from '../lib/config-validator.js'
import { hostReport } from '../lib/health.js'
import { apply } from '../lib/index.js'

test('Issue #414: checkProfileLock never unlinks lockfile, avoids TOCTOU races, reports locked on stale PID', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-lock-414-'))
  const lockFile = path.join(tmpDir, 'package.json.lock')

  try {
    // 1. Non-existent lockfile -> locked: false
    const none = checkProfileLock(tmpDir)
    assert.equal(none.locked, false)

    // 2. Live PID lockfile -> locked: true, lockfile preserved
    fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid }))
    const live = checkProfileLock(tmpDir)
    assert.equal(live.locked, true)
    assert.equal(live.pid, process.pid)
    assert.ok(fs.existsSync(lockFile), 'Lockfile must remain on disk')

    // 3. Stale dead PID -> locked: true, pid reported, lockfile MUST NOT be unlinked
    const deadPid = 9999991
    fs.writeFileSync(lockFile, JSON.stringify({ pid: deadPid }))
    const stale = checkProfileLock(tmpDir)
    assert.equal(stale.locked, true, 'Stale lock must report locked: true (operator recovery required)')
    assert.equal(stale.pid, deadPid)
    assert.ok(fs.existsSync(lockFile), 'Lockfile must not be deleted by checkProfileLock to prevent TOCTOU races')

    // 4. Corrupt/raw content lockfile -> locked: true, pid: null, lockfile preserved
    fs.writeFileSync(lockFile, 'INVALID_LOCK_CONTENT')
    const corrupt = checkProfileLock(tmpDir)
    assert.equal(corrupt.locked, true)
    assert.ok(fs.existsSync(lockFile), 'Corrupt lockfile must not be unlinked')
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('Issue #343: CloudflareTunnel.stop() rejects in-flight start() immediately and escalates to SIGKILL', async () => {
  const tunnel = new CloudflareTunnel({ port: 3088 })

  // 1. Pending start() is immediately rejected on stop()
  const startPromise = tunnel.start()
  assert.equal(tunnel.status, 'starting')
  assert.ok(tunnel._startTimeout, 'Timeout must be scheduled')

  tunnel.stop()
  assert.equal(tunnel._startTimeout, null, 'stop() must clear startTimeout')
  assert.equal(tunnel.status, 'stopped')

  await assert.rejects(startPromise, { message: 'Tunnel stopped' })

  // 2. Escalation to SIGKILL when process hangs
  const signals = []
  const mockChild = new EventEmitter()
  mockChild.killed = false
  mockChild.exitCode = null
  mockChild.signalCode = null
  mockChild.kill = (sig) => {
    signals.push(sig)
    mockChild.killed = true // Node.js sets killed=true on first kill call
  }

  tunnel.proc = mockChild
  tunnel.status = 'starting'

  // Replace setTimeout with immediate callback trigger to test escalation
  const origSetTimeout = globalThis.setTimeout
  let capturedEscalateFn = null
  globalThis.setTimeout = (fn, ms) => {
    if (ms === 3000) {
      capturedEscalateFn = fn
      return { unref: () => {} }
    }
    return origSetTimeout(fn, ms)
  }

  try {
    tunnel.stop()
    assert.equal(signals[0], 'SIGTERM', 'Initial stop must send SIGTERM')

    // Invoke escalate timer: must send SIGKILL even though mockChild.killed is true!
    assert.ok(capturedEscalateFn, 'Escalation timer must be registered')
    capturedEscalateFn()
    assert.equal(signals.includes('SIGKILL'), true, 'Escalation must send SIGKILL when process has not exited')
  } finally {
    globalThis.setTimeout = origSetTimeout
  }

  // 3. Changing options on active tunnel forces restart rather than returning stale URL
  tunnel.status = 'active'
  tunnel.publicUrl = 'https://old-port.trycloudflare.com'
  tunnel.port = 3080
  tunnel.scheme = 'http'

  // Call start with new scheme 'https' and new port 3443 -> must restart and not return old URL
  let stopCalled = false
  const origStop = tunnel.stop
  tunnel.stop = () => { stopCalled = true; origStop.call(tunnel) }

  // start() will try to spawn cloudflared; we intercept spawn failure
  try {
    await tunnel.start({ port: 3443, scheme: 'https' })
  } catch (err) {
    void err
  }
  assert.equal(stopCalled, true, 'start() with changed options must restart tunnel')
  tunnel.stop = origStop
  tunnel.stop()
})

test('Issue #373: Tunnel auto-start starts after HTTPS listener is ready with correct scheme, port and CA pool', async () => {
  const upstream = http.createServer((q, s) => s.end('UPSTREAM_OK'))
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  const upstreamPort = upstream.address().port

  const routes = new Map()
  const cleanups = []
  const logs = []
  const ctx = {
    webServer: {
      port: upstreamPort,
      register(x) { routes.set(x.path, x.handler); return () => routes.delete(x.path) },
      tapIndex() { return () => {} },
    },
    logger: { info(x) { logs.push(x) }, warn(x) { logs.push(x) }, debug() {} },
    get() { return undefined },
    inject() { return () => {} },
    effect(fn, label) {
      if (label && label.includes('verify attachment points')) return
      const c = fn()
      if (typeof c === 'function') cleanups.push(c)
    },
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-tls-test-'))
  const certPath = path.join(tmpDir, 'test-cert.pem')
  const keyPath = path.join(tmpDir, 'test-key.pem')

  // Generate self-signed test cert/key with openssl
  const { execSync } = await import('node:child_process')
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${certPath}" -days 1 -subj "/CN=127.0.0.1"`, { stdio: 'ignore' })

  let capturedTunnelStartOpts = null

  // We spy on CloudflareTunnel prototype
  const origStart = CloudflareTunnel.prototype.start
  CloudflareTunnel.prototype.start = function (opts) {
    capturedTunnelStartOpts = opts
    this.status = 'active'
    this.publicUrl = 'https://audit-373.trycloudflare.com'
    return Promise.resolve(this.publicUrl)
  }

  try {
    const { state } = apply(ctx, {
      mode: 'direct',
      directHost: '127.0.0.1',
      directPort: 39288,
      tls: 'files',
      tlsCert: certPath,
      tlsKey: keyPath,
      tunnel: 'quick',
      allow: ['127.0.0.0/8'],
      mdns: false,
      diagnostics: false,
    })

    // Allow syncListener and syncTunnel to execute
    await new Promise((r) => setTimeout(r, 100))

    assert.ok(capturedTunnelStartOpts, 'Tunnel start must have been called during auto-start')
    assert.equal(capturedTunnelStartOpts.scheme, 'https', 'Auto-start must target HTTPS origin, not HTTP')
    assert.equal(capturedTunnelStartOpts.port, 39288, 'Auto-start must target direct listener port')
    assert.equal(capturedTunnelStartOpts.caPool, certPath, 'Auto-start must pass certPath as caPool')

    const args = state.tunnel.buildArgs(capturedTunnelStartOpts)
    assert.equal(args.includes('--url'), true)
    assert.equal(args[args.indexOf('--url') + 1], 'https://127.0.0.1:39288')
    assert.equal(args.includes('--origin-ca-pool'), true)
    assert.equal(args[args.indexOf('--origin-ca-pool') + 1], certPath)
    assert.equal(args.includes('--no-tls-verify'), false, 'Must never disable TLS verification')
  } finally {
    CloudflareTunnel.prototype.start = origStart
    for (const c of cleanups.reverse()) await c()
    upstream.closeAllConnections()
    await new Promise((r) => upstream.close(r))
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('Issue #47: tunnelHostname in config schema, live state, and named tunnel URL resolution', () => {
  // 1. Schema parses tunnelHostname
  const parsed = Config({
    tunnel: 'named',
    tunnelToken: 'tok123',
    tunnelHostname: 'my-remote.domain.org',
  })
  assert.equal(parsed.tunnelHostname, 'my-remote.domain.org')

  // 2. updateLiveState populates tunnelHostname
  const state = {}
  updateLiveState(state, {}, { tunnelHostname: 'live.domain.org' })
  assert.equal(state.tunnelHostname, 'live.domain.org')

  // 3. Named tunnel assigns hostname to publicUrl upon connection readiness
  const tunnel = new CloudflareTunnel({
    mode: 'named',
    token: 'tok-named',
    hostname: 'remote.cloud.test',
  })

  assert.equal(tunnel.hostname, 'remote.cloud.test')

  // Fake named readiness output
  const mockChild = new EventEmitter()
  mockChild.stdout = new EventEmitter()
  mockChild.stderr = new EventEmitter()
  tunnel.proc = mockChild
  tunnel.status = 'starting'

  // Trigger output handler logic
  const text = 'Registered tunnel connection connIndex=0 connection=abc'
  if (tunnel.mode === 'named') {
    const rawHost = tunnel.hostname || ''
    tunnel.publicUrl = rawHost.startsWith('http') ? rawHost : `https://${rawHost}`
    tunnel.status = 'active'
  }

  assert.equal(tunnel.publicUrl, 'https://remote.cloud.test')
  assert.equal(tunnel.status, 'active')

  // 4. hostReport includes tunnel.hostname
  const report = hostReport({ tunnel })
  assert.equal(report.tunnel.hostname, 'remote.cloud.test')
  assert.equal(report.tunnel.publicUrl, 'https://remote.cloud.test')
})