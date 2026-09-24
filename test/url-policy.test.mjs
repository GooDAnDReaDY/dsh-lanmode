import test from 'node:test'
import assert from 'node:assert/strict'
import { allowed, parseAllow, addressBytes } from '../lib/access.js'

const lan = parseAllow(['192.168.0.0/16', '10.0.0.0/8', '::1/128']).rules

test('Issue #191: malformed and empty addresses are denied by an allowlist', () => {
  assert.equal(allowed('', lan), false)
  assert.equal(allowed('not-an-ip', lan), false)
  assert.equal(allowed('192.168.1.1/24', lan), false)
  assert.equal(allowed('999.1.1.1', lan), false)
  assert.equal(addressBytes('::gggg'), null)
})

test('Issue #191: IPv4-mapped IPv6 matches the IPv4 CIDR', () => {
  assert.equal(allowed('::ffff:192.168.1.20', lan), true)
  assert.equal(allowed('::ffff:8.8.8.8', lan), false)
})

test('Issue #191: IPv6 loopback is distinct from public v6', () => {
  assert.equal(allowed('::1', lan), true)
  assert.equal(allowed('2001:db8::1', lan), false)
})

test('Issue #191: CIDR boundaries include the network and exclude the neighbour', () => {
  const slash24 = parseAllow(['192.168.1.0/24']).rules
  assert.equal(allowed('192.168.1.0', slash24), true)
  assert.equal(allowed('192.168.1.255', slash24), true)
  assert.equal(allowed('192.168.2.0', slash24), false)
})
