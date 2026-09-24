import test from 'node:test'
import assert from 'node:assert/strict'
import { clientIp, DEFAULT_TRUSTED_PROXY_CIDRS } from '../lib/bridge-utils.js'

function req(remote, headers = {}) {
  return { socket: { remoteAddress: remote }, headers }
}

test('Issue #269: direct peer ignores spoofed X-Forwarded-For', () => {
  const ip = clientIp(req('203.0.113.10', { 'x-forwarded-for': '198.51.100.1' }))
  assert.equal(ip, '203.0.113.10')
})

test('Issue #269: trusted loopback proxy may set X-Forwarded-For', () => {
  const ip = clientIp(req('127.0.0.1', { 'x-forwarded-for': '198.51.100.7, 127.0.0.1' }))
  assert.equal(ip, '198.51.100.7')
})

test('Issue #269: trusted proxy may set CF-Connecting-IP', () => {
  const ip = clientIp(req('::1', { 'cf-connecting-ip': '198.51.100.9' }))
  assert.equal(ip, '198.51.100.9')
})

test('Issue #269: default trusted proxy CIDRs are loopback only', () => {
  assert.deepEqual(DEFAULT_TRUSTED_PROXY_CIDRS, ['127.0.0.0/8', '::1/128'])
})
