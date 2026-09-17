import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import http2 from 'node:http2'
import tls from 'node:tls'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startDirectBridge } from '../lib/bridge.js'
import { filterH2Headers, rewritten } from '../lib/bridge-utils.js'
import { ensureCertificate } from '../lib/tls.js'

test('Issue #148: filterH2Headers удаляет запрещенные в HTTP/2 заголовки соединения', () => {
  const input = {
    'content-type': 'text/event-stream',
    'connection': 'keep-alive',
    'keep-alive': 'timeout=5',
    'transfer-encoding': 'chunked',
    'upgrade': 'websocket',
    'proxy-connection': 'keep-alive',
    'trailer': 'foo',
    'x-custom-header': 'safe',
  }
  const filtered = filterH2Headers(input)
  assert.equal(filtered['x-custom-header'], 'safe')
  assert.equal(filtered['content-type'], 'text/event-stream')
  assert.equal(filtered['connection'], undefined)
  assert.equal(filtered['keep-alive'], undefined)
  assert.equal(filtered['transfer-encoding'], undefined)
  assert.equal(filtered['upgrade'], undefined)
  assert.equal(filtered['proxy-connection'], undefined)
  assert.equal(filtered['trailer'], undefined)
})

test('Issue #148: rewritten удаляет псевдозаголовки HTTP/2 (начинающиеся с :) перед проксированием в HTTP/1.1', () => {
  const h2Headers = {
    ':authority': 'dsh.local:3080',
    ':method': 'GET',
    ':path': '/api/chat',
    ':scheme': 'https',
    'accept': 'application/json',
    'user-agent': 'TestAgent',
  }
  const result = rewritten(h2Headers, '127.0.0.1:3000')
  assert.equal(result.host, '127.0.0.1:3000')
  assert.equal(result[':authority'], undefined)
  assert.equal(result[':method'], undefined)
  assert.equal(result[':path'], undefined)
  assert.equal(result[':scheme'], undefined)
  assert.equal(result.accept, 'application/json')
  assert.equal(result['user-agent'], 'TestAgent')
})

test('Issue #148: HTTP/2 мост согласует ALPN h2, мультиплексирует потоки и очищает заголовки ответов', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-h2-test-'))
  const certData = await ensureCertificate({ dir: tmpDir, hosts: ['localhost', '127.0.0.1'], log: () => {} })

  // 1. Upstream backend (HTTP/1.1)
  const upstream = http.createServer((req, res) => {
    assert.ok(!Object.keys(req.headers).some(k => k.startsWith(':')), 'Апстрим не должен получать псевдозаголовки')
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'connection': 'keep-alive',
      'transfer-encoding': 'chunked',
      'x-server-backend': 'dsh-core',
    })
    res.end(JSON.stringify({ path: req.url, ok: true }))
  })
  await new Promise(r => upstream.listen(0, '127.0.0.1', r))
  const upstreamPort = upstream.address().port

  // 2. Direct Bridge with TLS (HTTP/2 enabled)
  const tempSrv = http.createServer()
  await new Promise(r => tempSrv.listen(0, '127.0.0.1', r))
  const bridgePort = tempSrv.address().port
  tempSrv.close()

  const stopBridge = startDirectBridge(
    { webServer: { port: upstreamPort } },
    {
      port: bridgePort,
      hosts: ['127.0.0.1'],
      tls: { cert: certData.cert, key: certData.key },
      log: () => {},
    }
  )

  await new Promise(r => setTimeout(r, 150))

  try {
    // 3. Connect HTTP/2 client
    const client = http2.connect(`https://127.0.0.1:${bridgePort}`, {
      rejectUnauthorized: false,
    })

    await new Promise((resolve, reject) => {
      client.on('connect', resolve)
      client.on('error', reject)
    })

    assert.equal(client.alpnProtocol, 'h2', 'ALPN протокол обязан быть h2')

    // 4. Test single request and verify hop-by-hop headers are removed
    const singleReq = client.request({
      ':path': '/api/test-headers',
      ':method': 'GET',
    })

    let singleHeaders = null
    let singleBody = ''
    singleReq.on('response', (headers) => { singleHeaders = headers })
    singleReq.on('data', (chunk) => { singleBody += chunk.toString() })
    await new Promise((resolve) => singleReq.on('end', resolve))

    assert.equal(singleHeaders[':status'], 200)
    assert.equal(singleHeaders['x-server-backend'], 'dsh-core')
    assert.equal(singleHeaders['connection'], undefined, 'connection заголовок обязан отсутствовать в HTTP/2 ответе')
    assert.equal(singleHeaders['transfer-encoding'], undefined, 'transfer-encoding заголовок обязан отсутствовать в HTTP/2 ответе')
    assert.equal(singleHeaders['keep-alive'], undefined, 'keep-alive заголовок обязан отсутствовать в HTTP/2 ответе')

    const json = JSON.parse(singleBody)
    assert.equal(json.ok, true)
    assert.equal(json.path, '/api/test-headers')

    // 5. Test 10 concurrent multiplexed streams over the single connection
    // (Bypasses the 6-connection HTTP/1.1 browser limit)
    const streamPromises = []
    for (let i = 1; i <= 10; i++) {
      const p = new Promise((resolve, reject) => {
        const stream = client.request({
          ':path': `/api/stream-${i}`,
          ':method': 'GET',
        })
        let body = ''
        stream.on('data', chunk => { body += chunk.toString() })
        stream.on('end', () => {
          const parsed = JSON.parse(body)
          assert.equal(parsed.path, `/api/stream-${i}`)
          resolve()
        })
        stream.on('error', reject)
      })
      streamPromises.push(p)
    }

    await Promise.all(streamPromises)

    client.close()
  } finally {
    await stopBridge()
    await new Promise(r => upstream.close(r))
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('Issue #148: WebSocket Upgrade корректно работает через HTTP/1.1 откат на том же TLS порту', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-h2-ws-test-'))
  const certData = await ensureCertificate({ dir: tmpDir, hosts: ['localhost', '127.0.0.1'], log: () => {} })

  // Upstream with WebSocket responder
  const upstream = http.createServer()
  upstream.on('upgrade', (req, socket, head) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    socket.write('echo-websocket-payload')
  })
  await new Promise(r => upstream.listen(0, '127.0.0.1', r))
  const upstreamPort = upstream.address().port

  const tempSrv = http.createServer()
  await new Promise(r => tempSrv.listen(0, '127.0.0.1', r))
  const bridgePort = tempSrv.address().port
  tempSrv.close()

  const stopBridge = startDirectBridge(
    { webServer: { port: upstreamPort } },
    {
      port: bridgePort,
      hosts: ['127.0.0.1'],
      tls: { cert: certData.cert, key: certData.key },
      log: () => {},
    }
  )

  await new Promise(r => setTimeout(r, 150))

  try {
    const rawReq = [
      'GET /ws HTTP/1.1',
      'Host: 127.0.0.1',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
      'Sec-WebSocket-Version: 13',
      '',
      '',
    ].join('\r\n')

    const resData = await new Promise((resolve, reject) => {
      const client = tls.connect({
        port: bridgePort,
        host: '127.0.0.1',
        rejectUnauthorized: false,
        ALPNProtocols: ['http/1.1'],
      }, () => {
        client.write(rawReq)
      })

      let data = ''
      client.on('data', chunk => {
        data += chunk.toString()
        if (data.includes('101 Switching Protocols')) {
          client.destroy()
          resolve(data)
        }
      })
      client.on('error', reject)
    })

    assert.ok(resData.includes('101 Switching Protocols'), 'Откат на HTTP/1.1 должен возвращать 101 для WebSocket')
  } finally {
    try { stopBridge() } catch (_) {}
    try { upstream.close() } catch (_) {}
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
