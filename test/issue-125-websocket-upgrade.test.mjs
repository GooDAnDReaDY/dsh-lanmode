import assert from 'node:assert/strict'
import http from 'node:http'
import { test } from 'node:test'

import { startDirectBridge } from '../lib/bridge.js'

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

function freePort() {
  const probe = http.createServer()
  return listen(probe).then((port) => new Promise((resolve) => probe.close(() => resolve(port))))
}

test('issue #125: websocket upgrade forwards Connection and Upgrade headers to upstream', async () => {
  let wsReceivedHeaders = null
  let httpReceivedHeaders = null

  const upstream = http.createServer((req, res) => {
    httpReceivedHeaders = req.headers
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
  })

  upstream.on('upgrade', (req, socket, head) => {
    wsReceivedHeaders = req.headers
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n'
      + 'Upgrade: websocket\r\n'
      + 'Connection: Upgrade\r\n'
      + '\r\n'
    )
    socket.destroy()
  })

  const upstreamPort = await listen(upstream)
  const bridgePort = await freePort()

  const stop = startDirectBridge(
    { webServer: { port: upstreamPort } },
    { hosts: ['127.0.0.1'], port: bridgePort, log: () => {} },
  )
  await new Promise((resolve) => setTimeout(resolve, 150))

  try {
    // 1. Regular HTTP request: client sends an upgrade header, but normal HTTP request handler strips it
    await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: bridgePort,
        path: '/api/test-http',
        headers: {
          'Upgrade': 'websocket',
        },
      }, (res) => {
        res.resume()
        res.on('end', resolve)
      })
      req.on('error', reject)
      req.end()
    })
    assert.equal(httpReceivedHeaders.upgrade, undefined, 'standard HTTP request must not forward upgrade header')

    // 2. WebSocket upgrade request: upgrade handler MUST forward Connection and Upgrade headers
    await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: bridgePort,
        path: '/api/events.mux',
        headers: {
          'Connection': 'Upgrade',
          'Upgrade': 'websocket',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
        },
      })
      req.on('upgrade', (res, socket) => {
        socket.destroy()
        resolve()
      })
      req.on('error', reject)
      req.end()
    })

    assert.ok(wsReceivedHeaders, 'upstream should receive upgrade request')
    assert.match(wsReceivedHeaders.connection || '', /Upgrade/i, 'upstream must receive Connection: Upgrade')
    assert.equal(wsReceivedHeaders.upgrade, 'websocket', 'upstream must receive Upgrade: websocket')
    assert.equal(wsReceivedHeaders.host, `127.0.0.1:${upstreamPort}`, 'upstream must receive rewritten host')
  } finally {
    stop()
    upstream.close()
  }
})
