import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

import { generateAppleMobileConfig } from '../lib/tls.js'
import { DeviceRegistry } from '../lib/devices.js'
import { resolveClientRole, parseAllow } from '../lib/access.js'
import { categorizeInterface, startDirectBridge } from '../lib/bridge.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(here, '..')

test('Issue #123 Standard 1: Zero Cyrillic in all runtime modules (lib/*.js)', () => {
  const libDir = path.join(rootDir, 'lib')
  const cyrillicRegex = /[\u0400-\u04FF]/
  const violations = []

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        scanDir(full)
      } else if (ent.isFile() && ent.name.endsWith('.js')) {
        const content = fs.readFileSync(full, 'utf8')
        const lines = content.split('\n')
        lines.forEach((line, idx) => {
          if (cyrillicRegex.test(line)) {
            violations.push(`${path.relative(rootDir, full)}:L${idx + 1}: ${line.trim()}`)
          }
        })
      }
    }
  }

  scanDir(libDir)
  assert.deepEqual(violations, [], `Found Cyrillic characters in runtime code:\n${violations.slice(0, 10).join('\n')}`)
})

test('Issue #123 Standard 2: Clean npm package files configuration', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
  assert.ok(Array.isArray(pkg.files), 'package.json must specify files list')
  assert.ok(pkg.files.includes('lib/'), 'files must include lib/')
  assert.ok(!pkg.files.includes('docs/'), 'files MUST NOT include docs/')
  assert.ok(!pkg.files.includes('test/'), 'files MUST NOT include test/')
})

test('Issue #123 Feature 1: Connected Devices registry & revoke-others', () => {
  const reg = new DeviceRegistry()
  reg.devices.clear()
  reg.touch('dev-1', { headers: { 'user-agent': 'iPhone iOS 17' }, socket: { remoteAddress: '192.168.1.50' } })
  reg.touch('dev-2', { headers: { 'user-agent': 'MacBook Safari' }, socket: { remoteAddress: '192.168.1.60' } })
  reg.touch('dev-3', { headers: { 'user-agent': 'Android Chrome' }, socket: { remoteAddress: '100.64.0.10' } })

  const list = reg.list()
  assert.equal(list.length, 3, 'All 3 devices registered')

  const dev1 = list[0]
  assert.ok(dev1.id)
  assert.ok(dev1.createdAt)
  assert.ok(dev1.lastSeenAt)

  // Revoke device 1
  const revoked = reg.revoke(dev1.id)
  assert.equal(revoked, true)
  assert.equal(reg.list().filter((d) => !d.revoked).length, 2)

  // Revoke others keeping dev2
  const remaining = reg.list()
  const keeper = remaining.find((d) => !d.revoked)
  reg.revokeAllExcept(keeper.id)
  const afterRevokeOthers = reg.list().filter((d) => !d.revoked)
  assert.equal(afterRevokeOthers.length, 1)
  assert.equal(afterRevokeOthers[0].id, keeper.id)
})

test('Issue #123 Feature 2: 1-Click Apple .mobileconfig Profile Generation', () => {
  const fakePem = '-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIU...fake...\n-----END CERTIFICATE-----'
  const xml = generateAppleMobileConfig(fakePem)

  assert.ok(xml.includes('<?xml version="1.0" encoding="UTF-8"?>'))
  assert.ok(xml.includes('<plist version="1.0">'))
  assert.ok(xml.includes('<string>com.apple.security.root</string>'))
  assert.ok(xml.includes('<string>app.goodandready.dsh.lanmode.ca-cert</string>'))
  assert.ok(xml.includes('<string>dsh-root-ca.crt</string>'))
  assert.ok(xml.includes('<data>'))
})

test('Issue #123 Feature 3: Subnet Role Separation (Admin vs Guest)', () => {
  const adminRules = parseAllow(['192.168.1.0/24', '127.0.0.1']).rules
  const guestRules = parseAllow(['192.168.2.0/24', '10.0.0.5']).rules
  const defaultRules = parseAllow(['192.168.0.0/16']).rules

  const role1 = resolveClientRole('192.168.1.50', { adminRules, guestRules, defaultRules })
  assert.equal(role1, 'admin', '192.168.1.50 should be admin')

  const role2 = resolveClientRole('192.168.2.100', { adminRules, guestRules, defaultRules })
  assert.equal(role2, 'guest', '192.168.2.100 should be guest')

  const role3 = resolveClientRole('192.168.3.10', { defaultRules })
  assert.equal(role3, 'admin', 'Subnet in defaultRules without specific guest assignment defaults to admin')

  const role4 = resolveClientRole('172.16.0.1', { adminRules, guestRules, defaultRules })
  assert.equal(role4, 'denied', 'Address outside allowed subnets has role denied')
})

test('Issue #123 Feature 4: Network Interface Categorization', () => {
  assert.equal(categorizeInterface('lo', '127.0.0.1'), 'loopback')
  assert.equal(categorizeInterface('eth0', '192.168.1.111'), 'lan')
  assert.equal(categorizeInterface('wlan0', '10.0.0.15'), 'lan')
  assert.equal(categorizeInterface('tailscale0', '100.85.12.34'), 'tailscale')
  assert.equal(categorizeInterface('wg0', '10.10.0.2'), 'wireguard')
  assert.equal(categorizeInterface('tun0', '10.8.0.1'), 'vpn')
})

test('Issue #123 Feature 5: Telemetry and Device REST Endpoints over Direct Bridge', async () => {
  // Start minimal dummy upstream server representing harness
  const upstream = http.createServer((req, res) => {
    if (req.url === '/api/settings/config') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('harness upstream')
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const upstreamPort = upstream.address().port

  const reg = new DeviceRegistry()
  reg.devices.clear()
  reg.touch('dev-test', { headers: { 'user-agent': 'Safari Mobile' }, socket: { remoteAddress: '192.168.1.10' } })

  const fakeCtx = {
    webServer: {
      address() { return { port: upstreamPort } },
      get() { return null },
    },
  }

  const tempServer = http.createServer()
  await new Promise((resolve) => tempServer.listen(0, '127.0.0.1', resolve))
  const bridgePort = tempServer.address().port
  await new Promise((resolve) => tempServer.close(resolve))

  const stopBridge = startDirectBridge(fakeCtx, {
    hosts: ['127.0.0.1'],
    port: bridgePort,
    deviceRegistry: reg,
    adminAllow: ['127.0.0.1'],
    guestAllow: ['192.168.99.0/24'],
    streamTimeoutMs: 1000,
  })
  await new Promise((resolve) => setTimeout(resolve, 150))

  try {
    // 1. Test telemetry endpoint
    const telRes = await fetch(`http://127.0.0.1:${bridgePort}/dsh-lanmode/api/telemetry`)
    assert.equal(telRes.status, 200)
    const telData = await telRes.json()
    assert.ok(typeof telData.activeConnections === 'number')
    assert.ok(typeof telData.totalBytesSent === 'number')
    assert.ok(typeof telData.totalBytesReceived === 'number')

    // 2. Test interfaces endpoint
    const ifRes = await fetch(`http://127.0.0.1:${bridgePort}/dsh-lanmode/api/interfaces`)
    assert.equal(ifRes.status, 200)
    const ifData = await ifRes.json()
    assert.ok(Array.isArray(ifData))
    assert.ok(ifData.some((i) => i.address === '127.0.0.1' || i.type))

    // 3. Test devices endpoint
    const devRes = await fetch(`http://127.0.0.1:${bridgePort}/dsh-lanmode/api/devices`)
    assert.equal(devRes.status, 200)
    const devData = await devRes.json()
    assert.ok(Array.isArray(devData))
    assert.equal(devData.length, 1)
    assert.equal(devData[0].ip, '192.168.1.10')

    // 4. Test .mobileconfig endpoint (404 since no TLS is active in this test, but handled cleanly)
    const profRes = await fetch(`http://127.0.0.1:${bridgePort}/dsh-lanmode/ca.mobileconfig`)
    assert.ok([200, 404].includes(profRes.status))

    // 5. Test admin vs guest role blocking (127.0.0.1 is admin, so /api/settings should succeed)
    const adminRes = await fetch(`http://127.0.0.1:${bridgePort}/api/settings/config`)
    assert.equal(adminRes.status, 200)
  } finally {
    await stopBridge()
    upstream.close()
  }
})
