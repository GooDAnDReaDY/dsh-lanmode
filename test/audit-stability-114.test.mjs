import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import net from 'node:net'
import vm from 'node:vm'
import { startMdnsResponder } from '../lib/mdns.js'
import { DeviceRegistry } from '../lib/devices.js'
import { AuthManager } from '../lib/auth.js'
import { startDirectBridge } from '../lib/bridge.js'

test('Issue #114: DeviceRegistry ограничивает емкость до 200 устройств и восстанавливается после сбоев', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-dev-test-'))
  const filePath = path.join(tmpDir, 'devices.json')
  try {
    fs.writeFileSync(filePath, '{ bad json content', 'utf8')
    const reg = new DeviceRegistry({ filePath })
    assert.equal(reg.list().length, 0)
    for (let i = 1; i <= 210; i++) {
      reg.touch('dev-' + i, { headers: { 'user-agent': 'TestAgent' }, socket: { remoteAddress: '192.168.1.1' } })
    }
    assert.ok(reg.devices.size <= 200)
    assert.equal(reg.devices.has('dev-1'), false)
    assert.equal(reg.devices.has('dev-210'), true)
    assert.equal(reg.isRevoked('dev-210'), false)
    reg.revoke('dev-210')
    assert.equal(reg.isRevoked('dev-210'), true)
    reg.revokeAll()
    assert.equal(reg.isRevoked('dev-205'), true)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('Issue #114: AuthManager синхронизирует сессии с DeviceRegistry', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-auth-test-'))
  const filePath = path.join(tmpDir, 'devices.json')
  try {
    const devReg = new DeviceRegistry({ filePath })
    const auth = new AuthManager({
      user: 'admin',
      password: 'password123',
      sessionDays: 1,
      deviceRegistry: devReg,
    })
    const session = auth.createSession('admin', { headers: { 'user-agent': 'Test' }, socket: { remoteAddress: '192.168.1.5' } })
    assert.ok(session && session.token)
    assert.ok(auth.validateSession(session.token))
    devReg.revoke(session.token)
    assert.equal(auth.validateSession(session.token), null)
    const session2 = auth.createSession('admin', { headers: {}, socket: {} })
    auth.revokeSession(session2.token)
    assert.equal(auth.validateSession(session2.token), null)
    assert.equal(devReg.isRevoked(session2.token), true)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('Issue #114: startMdnsResponder закрывается без утечек', () => {
  const closeResponder = startMdnsResponder({
    name: 'test-dsh.local',
    addresses: ['192.168.1.150'],
    log: () => {},
  })
  assert.equal(typeof closeResponder, 'function')
  closeResponder()
  closeResponder()
  const noop = startMdnsResponder({ name: 'empty.local', addresses: [] })
  assert.equal(typeof noop, 'function')
  noop()
})

test('Issue #114: WebSocket аутентификация и проверка отозванных устройств в bridge.js', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('upstream ok')
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const upstreamPort = upstream.address().port
  const tempServer = http.createServer()
  await new Promise((resolve) => tempServer.listen(0, '127.0.0.1', resolve))
  const bridgePort = tempServer.address().port
  tempServer.close()
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-bridge-test-'))
  const devReg = new DeviceRegistry({ filePath: path.join(tmpDir, 'devices.json') })
  const auth = new AuthManager({ user: 'admin', password: 'securepassword', deviceRegistry: devReg })
  let passwordAuthActive = true
  const stopBridge = startDirectBridge(
    { webServer: { port: upstreamPort } },
    {
      port: bridgePort,
      hosts: ['127.0.0.1'],
      passwordAuth: true,
      authManager: auth,
      deviceRegistry: devReg,
      log: () => {},
    }
  )
  await new Promise((resolve) => setTimeout(resolve, 120))
  try {
    const rawReq1 = ['GET /ws HTTP/1.1', 'Host: 127.0.0.1', 'Upgrade: websocket', 'Connection: Upgrade', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version: 13', '', ''].join(String.fromCharCode(13, 10))
    const res1 = await new Promise((resolve) => {
      const client = net.createConnection({ port: bridgePort, host: '127.0.0.1' }, () => { client.write(rawReq1) })
      let data = ''
      client.on('data', (chunk) => { data += chunk.toString() })
      client.on('end', () => resolve(data))
      client.on('close', () => resolve(data))
    })
    assert.ok(res1.includes('401 Unauthorized'), 'Неавторизованный WS запрос обязан отклоняться с 401')
    // revoked token test
    devReg.touch('revoked-token', { headers: {}, socket: { remoteAddress: '127.0.0.1' } })
    devReg.revoke('revoked-token')
    const rawReq2 = ['GET /ws HTTP/1.1', 'Host: 127.0.0.1', 'Upgrade: websocket', 'Connection: Upgrade', 'Cookie: dsh_token=revoked-token', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version: 13', '', ''].join(String.fromCharCode(13, 10))
    const res2 = await new Promise((resolve) => {
      const client = net.createConnection({ port: bridgePort, host: '127.0.0.1' }, () => { client.write(rawReq2) })
      let data = ''
      client.on('data', (chunk) => { data += chunk.toString() })
      client.on('end', () => resolve(data))
      client.on('close', () => resolve(data))
    })
    assert.ok(res2.includes('401 Unauthorized'), 'WS запрос с отозванным токеном обязан отклоняться с 401')
  } finally {
    stopBridge()
    await new Promise((resolve) => upstream.close(resolve))
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('Issue #114: ErrorBoundary в client.js и токены стилей clinebot', () => {
  const clientCode = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.ok(clientCode.includes('class ErrorBoundary extends React.Component'))
  assert.ok(clientCode.includes('.lm-section-card'))
  assert.ok(clientCode.includes('.lm-form-box'))
  assert.ok(clientCode.includes('--dsw-alias-border-l2'))
})
