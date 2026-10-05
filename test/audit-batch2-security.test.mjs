// Audit test suite for security batch: Issues #266, #354, #361, #369.
// Zero hardcoded Cyrillic characters.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { once } from 'node:events'

import { DeviceRegistry, hashToken } from '../lib/devices.js'
import { AuthManager, digestToken } from '../lib/auth.js'
import { resolveSecret, clearSecretCache, SECRET_POSITIVE_TTL_MS } from '../lib/secret.js'
import { apply } from '../lib/index.js'

test('Issue #266 & #369: AuthManager session does not leak raw token to DeviceRegistry or disk; revocations survive restart and LRU eviction', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sec-266-369-'))
  const devFile = path.join(tmpDir, 'devices.json')

  try {
    const reg = new DeviceRegistry(devFile)
    const auth = new AuthManager({ deviceRegistry: reg })
    const mockReq = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'user-agent': 'SecurityAuditAgent' } }

    const session = auth.createSession('admin', mockReq, true)
    assert.ok(session.token, 'Session token must exist')

    // 1. DeviceRegistry must NOT store raw token
    assert.equal(reg.devices.has(session.token), false, 'DeviceRegistry must not key by raw token')
    assert.equal(reg.devices.has(digestToken(session.token)), true, 'DeviceRegistry must key by session digest')

    const list = reg.list()
    assert.equal(list.length, 1)
    assert.equal(list[0].id, digestToken(session.token), 'list() must return digest, not raw token')

    // 2. Revoke session and verify eviction immunity
    reg.revoke(session.token)
    assert.equal(reg.isRevoked(session.token), true)
    assert.equal(reg.isRevoked(digestToken(session.token)), true)

    // Touch 205 devices to trigger 200-device LRU
    for (let i = 0; i < 205; i++) {
      reg.touch(`dummy-dev-${i}`, mockReq)
    }

    assert.equal(reg.isRevoked(session.token), true, 'Revocation must survive 200-device LRU eviction')
    assert.equal(reg.isRevoked(digestToken(session.token)), true)

    reg.flush()

    // 3. Disk content must not contain raw token
    const diskContent = fs.readFileSync(devFile, 'utf8')
    assert.equal(diskContent.includes(session.token), false, 'Disk storage must never contain raw token')

    // 4. Revocation must survive reload/restart
    const reloadedReg = new DeviceRegistry(devFile)
    assert.equal(reloadedReg.isRevoked(session.token), true, 'Revocation must survive server restart')
    assert.equal(reloadedReg.isRevoked(digestToken(session.token)), true)

    auth.destroy()
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('Issue #354: tls:files fails closed on certificate read error and refuses unencrypted HTTP bridge', async () => {
  const upstream = http.createServer((q, s) => s.end('AUDIT_UPSTREAM'))
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

  const badCertPath = path.join(os.tmpdir(), 'non-existent-lanmode-cert.pem')
  const badKeyPath = path.join(os.tmpdir(), 'non-existent-lanmode-key.pem')

  apply(ctx, {
    mode: 'direct',
    directHost: '127.0.0.1',
    directPort: 39188,
    tls: 'files',
    tlsCert: badCertPath,
    tlsKey: badKeyPath,
    allow: ['127.0.0.0/8'],
    mdns: false,
    diagnostics: false,
  })
  await new Promise((r) => setTimeout(r, 150))

  // Must fail closed: logs show refusal to open unencrypted bridge
  const refusedLog = logs.some((l) => String(l).includes('refusing to open unencrypted bridge in tls:files mode'))
  assert.equal(refusedLog, true, 'Log must report refusal to open unencrypted bridge in tls:files mode')

  // Verify no unencrypted HTTP server is listening on port 39188
  let connectionFailed = false
  try {
    await fetch('http://127.0.0.1:39188/', { signal: AbortSignal.timeout(500) })
  } catch (err) {
    connectionFailed = true
    void err
  }
  assert.equal(connectionFailed, true, 'Port must not accept plaintext HTTP when tls:files fails')

  for (const c of cleanups.reverse()) await c()
  upstream.closeAllConnections()
  await new Promise((r) => upstream.close(r))
})

test('Issue #361: Credential cache isolates provider contexts, rotates instantly, and never returns ref string as value', async () => {
  clearSecretCache()

  let val1 = 'secret-one'
  const ctx1 = {
    credentials: {
      resolve: async (ref) => {
        assert.equal(typeof ref, 'string', 'DSH credential resolver receives string ref')
        return { value: val1 }
      },
    },
  }

  let val2 = 'secret-two'
  const ctx2 = {
    credentials: {
      resolve: async (ref) => {
        assert.equal(typeof ref, 'string')
        return { value: val2 }
      },
    },
  }

  // 1. Context isolation: separate ctx must not mix cached values
  const res1 = await resolveSecret(ctx1, 'AUDIT_REF')
  const res2 = await resolveSecret(ctx2, 'AUDIT_REF')
  assert.equal(res1, 'secret-one')
  assert.equal(res2, 'secret-two')

  // 2. Unresolved credential must return fallback, never ref name
  const missing = await resolveSecret({ credentials: { resolve: async () => null } }, 'AUDIT_MISSING', 'safe-fallback')
  assert.equal(missing, 'safe-fallback', 'Must return safe-fallback, not AUDIT_MISSING')

  const missingNoFallback = await resolveSecret({ credentials: { resolve: async () => null } }, 'AUDIT_MISSING')
  assert.equal(missingNoFallback, '', 'Must return empty string when unresolvable, never ref name')

  // 3. Instant rotation via clearSecretCache()
  val1 = 'secret-rotated'
  clearSecretCache()
  const fresh = await resolveSecret(ctx1, 'AUDIT_REF')
  assert.equal(fresh, 'secret-rotated')

  clearSecretCache()
})