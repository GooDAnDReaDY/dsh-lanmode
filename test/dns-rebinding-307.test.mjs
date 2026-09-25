import test from 'node:test'
import assert from 'node:assert/strict'
import { isTrustedLocalAuthority, isTrustedSameOrigin, verifyAdminAccess } from '../lib/access.js'

test('Issue #307: isTrustedLocalAuthority distinguishes local/LAN from attacker hostnames', () => {
  // 1. Loopback and localhost
  assert.equal(isTrustedLocalAuthority('localhost'), true)
  assert.equal(isTrustedLocalAuthority('localhost:3088'), true)
  assert.equal(isTrustedLocalAuthority('127.0.0.1'), true)
  assert.equal(isTrustedLocalAuthority('127.0.0.1:3080'), true)
  assert.equal(isTrustedLocalAuthority('[::1]'), true)
  assert.equal(isTrustedLocalAuthority('[::1]:3088'), true)
  assert.equal(isTrustedLocalAuthority('dsh.local'), true)

  // 2. Private LAN IPs
  assert.equal(isTrustedLocalAuthority('192.168.1.111'), true)
  assert.equal(isTrustedLocalAuthority('192.168.1.111:3088'), true)
  assert.equal(isTrustedLocalAuthority('10.0.0.5:8080'), true)
  assert.equal(isTrustedLocalAuthority('172.16.0.1:3080'), true)

  // 3. sslip.io / nip.io LAN wildcards
  assert.equal(isTrustedLocalAuthority('192.168.1.111.sslip.io'), true)
  assert.equal(isTrustedLocalAuthority('192.168.1.111.nip.io:3088'), true)
  assert.equal(isTrustedLocalAuthority('192-168-1-111.sslip.io'), true)

  // 4. Attacker-controlled external hostnames -> must be rejected
  assert.equal(isTrustedLocalAuthority('evil.example'), false)
  assert.equal(isTrustedLocalAuthority('evil.example:3088'), false)
  assert.equal(isTrustedLocalAuthority('attacker.com'), false)
  assert.equal(isTrustedLocalAuthority('8.8.8.8'), false)
  assert.equal(isTrustedLocalAuthority('8.8.8.8.sslip.io'), false)

  // 5. Explicitly allowed custom hosts
  const options = { config: { allowedHosts: ['custom.lan.internal'] } }
  assert.equal(isTrustedLocalAuthority('custom.lan.internal:3088', options), true)
  assert.equal(isTrustedLocalAuthority('other.external.com', options), false)
})

test('Issue #307: isTrustedSameOrigin rejects DNS-rebinding matching headers', () => {
  // Attacker-controlled host and origin that match each other -> MUST FAIL
  const attackerReq = {
    method: 'POST',
    headers: {
      host: 'evil.example:3088',
      origin: 'http://evil.example:3088',
    },
  }
  assert.equal(isTrustedSameOrigin(attackerReq), false)

  // Cross-site fetch site -> MUST FAIL
  const crossSiteReq = {
    method: 'POST',
    headers: {
      host: '127.0.0.1:3088',
      origin: 'http://127.0.0.1:3088',
      'sec-fetch-site': 'cross-site',
    },
  }
  assert.equal(isTrustedSameOrigin(crossSiteReq), false)

  // Valid local LAN matching headers -> MUST PASS
  const validLocalReq = {
    method: 'POST',
    headers: {
      host: '127.0.0.1:3088',
      origin: 'http://127.0.0.1:3088',
    },
  }
  assert.equal(isTrustedSameOrigin(validLocalReq), true)

  const validLanReq = {
    method: 'POST',
    headers: {
      host: '192.168.1.111:3088',
      origin: 'https://192.168.1.111:3088',
    },
  }
  assert.equal(isTrustedSameOrigin(validLanReq), true)
})

test('Issue #307: verifyAdminAccess blocks DNS rebinding even from loopback peer with passwordAuth: false', () => {
  const state = { passwordAuth: false }
  const config = { passwordAuth: false }

  // DNS-rebinding request coming from 127.0.0.1 but carrying attacker Host/Origin
  const rebindReq = {
    method: 'POST',
    headers: {
      host: 'evil.example:3088',
      origin: 'http://evil.example:3088',
    },
  }
  const rebindResult = verifyAdminAccess(rebindReq, {
    state,
    config,
    clientIp: '127.0.0.1',
    role: 'admin',
  })
  assert.equal(rebindResult.ok, false)
  assert.equal(rebindResult.status, 403)
  assert.ok(rebindResult.error.includes('Cross-site request rejected'))

  // Even for GET: loopback peer with untrusted Host header is rejected
  const rebindGet = {
    method: 'GET',
    headers: {
      host: 'evil.example:3088',
    },
  }
  const rebindGetResult = verifyAdminAccess(rebindGet, {
    state,
    config,
    clientIp: '127.0.0.1',
    role: 'admin',
  })
  assert.equal(rebindGetResult.ok, false)
  assert.equal(rebindGetResult.status, 403)
  assert.ok(rebindGetResult.error.includes('Untrusted host authority'))

  // Legitimate loopback request -> passes
  const validLocalGet = {
    method: 'GET',
    headers: {
      host: '127.0.0.1:3088',
    },
  }
  const validResult = verifyAdminAccess(validLocalGet, {
    state,
    config,
    clientIp: '127.0.0.1',
    role: 'admin',
  })
  assert.equal(validResult.ok, true)
})
