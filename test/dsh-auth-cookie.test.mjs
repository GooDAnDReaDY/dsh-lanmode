import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'
import {
  pickDshAuthCookie,
  mergeDshAuthCookie,
  cookieNameForAuthority,
  hasCoreAuthCookie,
  mintDshAuthCookie,
  mintCoreAuthCookie,
  encodeBase64Url,
  decodeBase64Url,
} from '../lib/dsh-auth-cookie.js'

test('Issue #261: pick the dsh-auth pair from Set-Cookie', () => {
  assert.equal(pickDshAuthCookie('dsh-auth-abc=secret; Path=/; HttpOnly'), 'dsh-auth-abc=secret')
  assert.equal(pickDshAuthCookie(['other=1', 'dsh-auth-ff=zz; Secure']), 'dsh-auth-ff=zz')
  assert.equal(pickDshAuthCookie('session=1'), '')
})

test('Issue #261: merge cached auth cookie only when the client lacks one', () => {
  assert.equal(mergeDshAuthCookie('', 'dsh-auth-abc=secret'), 'dsh-auth-abc=secret')
  assert.equal(mergeDshAuthCookie('a=1', 'dsh-auth-abc=secret'), 'a=1; dsh-auth-abc=secret')
  assert.equal(mergeDshAuthCookie('dsh-auth-abc=keep', 'dsh-auth-abc=other'), 'dsh-auth-abc=keep')
  assert.equal(mergeDshAuthCookie('a=1', ''), 'a=1')
})

test('Issue #232: hasCoreAuthCookie detection', () => {
  assert.equal(hasCoreAuthCookie(''), false)
  assert.equal(hasCoreAuthCookie('session=123'), false)
  assert.equal(hasCoreAuthCookie('session=123; dsh-auth-xyz=abc'), true)

  const authority = '127.0.0.1:3080'
  const expectedName = cookieNameForAuthority(authority)
  assert.equal(hasCoreAuthCookie(`${expectedName}=val; other=1`, authority), true)
  assert.equal(hasCoreAuthCookie('dsh-auth-different=val', authority), false)
})

test('Issue #232: mintDshAuthCookie generates verifiable core signature and payload', () => {
  const secret = crypto.randomBytes(32)
  const authority = '192.168.1.111:3088'
  const minted = mintDshAuthCookie(authority, secret, 30)

  assert.ok(minted)
  assert.ok(minted.name.startsWith('dsh-auth-'))
  assert.ok(minted.value.startsWith('v1.'))
  assert.equal(minted.pair, `${minted.name}=${minted.value}`)
  assert.ok(minted.setCookie.includes('Path=/'))
  assert.ok(minted.setCookie.includes('HttpOnly'))
  assert.ok(minted.setCookie.includes('SameSite=Strict'))

  // Verify internal payload structure and signature
  const parts = minted.value.split('.')
  assert.equal(parts.length, 3)
  assert.equal(parts[0], 'v1')

  const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8')
  const payload = JSON.parse(payloadJson)
  assert.equal(payload.version, 1)
  assert.equal(payload.authority, authority)
  assert.ok(payload.issuedAt <= Date.now())
  assert.ok(payload.expiresAt > Date.now())

  // Verify HMAC signature
  const expectedSig = encodeBase64Url(crypto.createHmac('sha256', secret).update(parts[1]).digest())
  assert.equal(parts[2], expectedSig)
})

test('Issue #232: mintCoreAuthCookie loopback fetch fallback', async () => {
  // Spin up a mock upstream HTTP server that behaves like DSH core
  const server = http.createServer((req, res) => {
    if (req.url.includes('token=test-launch-token')) {
      res.writeHead(303, {
        'set-cookie': 'dsh-auth-upstream123=v1.payload.sig; Path=/; HttpOnly; SameSite=Strict',
      })
      res.end()
    } else {
      res.writeHead(401)
      res.end()
    }
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const mockConnection = {
      authenticatedUrl(baseUrl) {
        return `${baseUrl}/?token=test-launch-token`
      },
    }

    const cookie = await mintCoreAuthCookie(mockConnection, {
      upstreamPort: port,
      authority: `127.0.0.1:${port}`,
    })
    assert.equal(cookie, 'dsh-auth-upstream123=v1.payload.sig')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
