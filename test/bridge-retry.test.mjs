// Issue #164: Safe idempotent retry on upstream socket reset and zero listener leaks.

import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'

import { startDirectBridge } from '../lib/bridge.js'

test('Issue #164: bridge automatically retries GET request on upstream socket reset', async () => {
  const logs = []
  const log = (msg) => logs.push(msg)

  let upstreamHits = 0
  const upstreamServer = http.createServer((req, res) => {
    upstreamHits++
    if (upstreamHits === 1) {
      // Simulate socket hang up / ECONNRESET on attempt 1
      req.socket.destroy()
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, attempt: upstreamHits }))
  })

  await new Promise((resolve) => upstreamServer.listen(0, '127.0.0.1', resolve))
  const upstreamPort = upstreamServer.address().port
  const bridgePort = upstreamPort + 1000

  const stop = startDirectBridge({ webServer: { port: upstreamPort } }, {
    hosts: ['127.0.0.1'],
    port: bridgePort,
    allow: ['127.0.0.0/8'],
    log,
  })

  try {
    await new Promise((resolve) => setTimeout(resolve, 100))

    const response = await fetch(`http://127.0.0.1:${bridgePort}/test-retry-get`)
    assert.equal(response.status, 200, 'GET request should succeed on retry')

    const data = await response.json()
    assert.equal(data.ok, true)
    assert.equal(data.attempt, 2, 'Should have reached attempt 2')

    const retryLogged = logs.some((l) => l.includes('retrying GET') && l.includes('(attempt 2)'))
    assert.ok(retryLogged, 'Bridge should log retry attempt')
  } finally {
    if (typeof stop === 'function') await stop()
    await new Promise((resolve) => upstreamServer.close(resolve))
  }
})

test('Issue #164: bridge retries reused socket reset and purges stale pool sockets', async () => {
  const logs = []
  const log = (msg) => logs.push(msg)

  let reqCount = 0
  const upstreamServer = http.createServer((req, res) => {
    reqCount++
    if (reqCount === 2) {
      // 2nd request uses pooled socket, simulate server keep-alive reset
      req.socket.destroy()
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`response-${reqCount}`)
  })

  await new Promise((resolve) => upstreamServer.listen(0, '127.0.0.1', resolve))
  const upstreamPort = upstreamServer.address().port
  const bridgePort = upstreamPort + 1001

  const stop = startDirectBridge({ webServer: { port: upstreamPort } }, {
    hosts: ['127.0.0.1'],
    port: bridgePort,
    allow: ['127.0.0.0/8'],
    log,
  })

  try {
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 1st request succeeds and returns socket to agent keep-alive pool
    const res1 = await fetch(`http://127.0.0.1:${bridgePort}/first`)
    assert.equal(res1.status, 200)
    assert.equal(await res1.text(), 'response-1')

    // 2nd request hits reset on reused socket, retries transparently on fresh connection
    const res2 = await fetch(`http://127.0.0.1:${bridgePort}/second`)
    assert.equal(res2.status, 200, 'Reused socket reset should transparently retry and return 200')
    assert.equal(await res2.text(), 'response-3')

    const retryLog = logs.some((l) => l.includes('reused') && l.includes('(attempt 2)'))
    assert.ok(retryLog, 'Should log retry on reused socket')
  } finally {
    if (typeof stop === 'function') await stop()
    await new Promise((resolve) => upstreamServer.close(resolve))
  }
})

test('Issue #164: non-idempotent POST requests are NOT retried on reset', async () => {
  const logs = []
  const log = (msg) => logs.push(msg)

  let postHits = 0
  const upstreamServer = http.createServer((req, res) => {
    postHits++
    req.socket.destroy()
  })

  await new Promise((resolve) => upstreamServer.listen(0, '127.0.0.1', resolve))
  const upstreamPort = upstreamServer.address().port
  const bridgePort = upstreamPort + 1002

  const stop = startDirectBridge({ webServer: { port: upstreamPort } }, {
    hosts: ['127.0.0.1'],
    port: bridgePort,
    allow: ['127.0.0.0/8'],
    log,
  })

  try {
    await new Promise((resolve) => setTimeout(resolve, 100))

    const response = await fetch(`http://127.0.0.1:${bridgePort}/api/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item: 1 }),
    })

    assert.equal(response.status, 502, 'Failed POST should return 502 without retry')
    assert.equal(postHits, 1, 'POST should only hit upstream once')

    const hasRetryLog = logs.some((l) => l.includes('retrying POST'))
    assert.equal(hasRetryLog, false, 'POST must not be retried')
  } finally {
    if (typeof stop === 'function') await stop()
    await new Promise((resolve) => upstreamServer.close(resolve))
  }
})

test('Issue #164: zero listener leak on socket reuse across multiple requests', async () => {
  const upstreamServer = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
  })

  await new Promise((resolve) => upstreamServer.listen(0, '127.0.0.1', resolve))
  const upstreamPort = upstreamServer.address().port
  const bridgePort = upstreamPort + 1003

  const warnings = []
  const onWarning = (w) => warnings.push(w)
  process.on('warning', onWarning)

  const stop = startDirectBridge({ webServer: { port: upstreamPort } }, {
    hosts: ['127.0.0.1'],
    port: bridgePort,
    allow: ['127.0.0.0/8'],
  })

  try {
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Send 15 requests to exercise socket pooling beyond default EventEmitter limit of 10
    for (let i = 0; i < 15; i++) {
      const res = await fetch(`http://127.0.0.1:${bridgePort}/ping`)
      assert.equal(res.status, 200)
      await res.text()
    }

    const hasMaxListeners = warnings.some((w) => w.name === 'MaxListenersExceededWarning')
    assert.equal(hasMaxListeners, false, 'Should have zero MaxListenersExceededWarning')
  } finally {
    process.off('warning', onWarning)
    if (typeof stop === 'function') await stop()
    await new Promise((resolve) => upstreamServer.close(resolve))
  }
})
