import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { startDirectBridge } from '../lib/bridge.js'

test('Issue #328: Bridge blocks cross-site mutating requests and forwards client IP', async () => {
  let lastUpstreamHeaders = null
  const upstream = http.createServer((req, res) => {
    lastUpstreamHeaders = req.headers
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, url: req.url }))
  })
  await new Promise(r => upstream.listen(0, '127.0.0.1', r))
  const upstreamPort = upstream.address().port

  const probe = http.createServer()
  await new Promise(r => probe.listen(0, '127.0.0.1', r))
  const bridgePort = probe.address().port
  await new Promise(r => probe.close(r))

  const stop = startDirectBridge({
    webServer: { address() { return { port: upstreamPort } } }
  }, {
    hosts: ['127.0.0.1'],
    port: bridgePort,
    adminAllow: ['127.0.0.1'],
  })
  await new Promise(r => setTimeout(r, 100))

  try {
    // 1. Cross-site POST -> 403
    const crossSiteRes = await fetch(`http://127.0.0.1:${bridgePort}/dsh-voice/transcribe`, {
      method: 'POST',
      headers: {
        'sec-fetch-site': 'cross-site',
        'origin': 'https://evil.example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ audio: 'fake' }),
    })
    assert.equal(crossSiteRes.status, 403, 'Cross-site POST must return 403')
    const crossBody = await crossSiteRes.json()
    assert.ok(crossBody.error.includes('Cross-site'), 'Error message mentions Cross-site')

    // 2. Untrusted Origin header without Sec-Fetch-Site -> 403
    const badOriginRes = await fetch(`http://127.0.0.1:${bridgePort}/dsh-clinebot/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'origin': 'https://attacker.site',
        'content-type': 'application/json',
      },
      body: '{}',
    })
    assert.equal(badOriginRes.status, 403, 'Untrusted Origin POST must return 403')

    // 3. Same-origin POST -> 200, and forwards X-Forwarded-For
    const validRes = await fetch(`http://127.0.0.1:${bridgePort}/dsh-voice/transcribe`, {
      method: 'POST',
      headers: {
        'sec-fetch-site': 'same-origin',
        'origin': `http://127.0.0.1:${bridgePort}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ test: 123 }),
    })
    assert.equal(validRes.status, 200, 'Same-origin POST must pass')
    assert.ok(lastUpstreamHeaders['x-forwarded-for'], 'Must forward client IP in X-Forwarded-For')
    assert.equal(lastUpstreamHeaders['x-forwarded-proto'], 'http')

    // 4. Safe GET request passes
    const getRes = await fetch(`http://127.0.0.1:${bridgePort}/dsh-voice/status`, {
      headers: {
        'sec-fetch-site': 'cross-site',
        'origin': 'https://evil.example.com',
      }
    })
    assert.equal(getRes.status, 200, 'Idempotent GET passes')
  } finally {
    await stop()
    upstream.close()
  }
})
