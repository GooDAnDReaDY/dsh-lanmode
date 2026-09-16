import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { parseUserAgent, DeviceRegistry } from '../lib/devices.js'
import { isLocalLanClient } from '../lib/bridge.js'
import {
  encodeDnsName,
  parseDnsName,
  parseQuery,
  buildResponse,
  buildServiceResponse,
} from '../lib/mdns.js'

test('Issue #128: parseUserAgent recognizes platform types and icons', () => {
  const iosUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
  const parsedIos = parseUserAgent(iosUa)
  assert.equal(parsedIos.os, 'iPhone')
  assert.equal(parsedIos.platform, 'ios')
  assert.equal(parsedIos.icon, 'mobile')

  const androidUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.119 Mobile Safari/537.36'
  const parsedAndroid = parseUserAgent(androidUa)
  assert.equal(parsedAndroid.os, 'Android')
  assert.equal(parsedAndroid.platform, 'android')
  assert.equal(parsedAndroid.icon, 'mobile')

  const macUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  const parsedMac = parseUserAgent(macUa)
  assert.equal(parsedMac.os, 'macOS')
  assert.equal(parsedMac.platform, 'macos')
  assert.equal(parsedMac.icon, 'desktop')

  const winUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0'
  const parsedWin = parseUserAgent(winUa)
  assert.equal(parsedWin.os, 'Windows')
  assert.equal(parsedWin.platform, 'windows')
  assert.equal(parsedWin.icon, 'desktop')

  const linuxUa = 'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0'
  const parsedLinux = parseUserAgent(linuxUa)
  assert.equal(parsedLinux.os, 'Linux')
  assert.equal(parsedLinux.platform, 'linux')
  assert.equal(parsedLinux.icon, 'desktop')
})

test('Issue #128: DeviceRegistry manages custom nicknames and persists them', () => {
  const tmpFile = path.join(os.tmpdir(), `dsh-test-devices-${Date.now()}.json`)
  try {
    const reg = new DeviceRegistry(tmpFile)
    const mockReq = {
      headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)' },
      socket: { remoteAddress: '192.168.1.150' },
    }
    const dev = reg.touch('dev-iphone-1', mockReq)
    assert.equal(dev.id, 'dev-iphone-1')
    assert.equal(dev.platform, 'ios')
    assert.equal(dev.nickname, '')

    // Set nickname
    const ok = reg.setNickname('dev-iphone-1', "Vadim's iPhone")
    assert.equal(ok, true)

    // Verify in list()
    const list = reg.list()
    assert.equal(list.length, 1)
    assert.equal(list[0].nickname, "Vadim's iPhone")
    assert.equal(list[0].platform, 'ios')

    // Touch again does not erase nickname
    reg.touch('dev-iphone-1', mockReq)
    assert.equal(reg.list()[0].nickname, "Vadim's iPhone")

    // Persistence reload test
    const reg2 = new DeviceRegistry(tmpFile)
    assert.equal(reg2.list().length, 1)
    assert.equal(reg2.list()[0].nickname, "Vadim's iPhone")
    assert.equal(reg2.list()[0].platform, 'ios')
  } finally {
    try { fs.unlinkSync(tmpFile) } catch (_) {}
  }
})

test('Issue #129: isLocalLanClient identifies LAN vs WAN/Tailscale', () => {
  // Loopback and LAN IPs bypass compression
  assert.equal(isLocalLanClient('127.0.0.1'), true)
  assert.equal(isLocalLanClient('::1'), true)
  assert.equal(isLocalLanClient('192.168.1.42'), true)
  assert.equal(isLocalLanClient('192.168.0.1'), true)
  assert.equal(isLocalLanClient('10.0.4.15'), true)
  assert.equal(isLocalLanClient('172.16.0.5'), true)
  assert.equal(isLocalLanClient('172.24.1.1'), true)
  assert.equal(isLocalLanClient('fe80::1'), true)
  assert.equal(isLocalLanClient('fd7a:115c::1'), true)

  // Remote WAN, Public, or Tailscale CGNAT IPs keep compression
  assert.equal(isLocalLanClient('100.123.213.28'), false) // Tailscale IP
  assert.equal(isLocalLanClient('100.64.0.1'), false) // CGNAT range
  assert.equal(isLocalLanClient('8.8.8.8'), false)
  assert.equal(isLocalLanClient('109.61.108.253'), false)
  assert.equal(isLocalLanClient(''), false)
})

test('Issue #130: mDNS responder builds DNS-SD PTR/SRV/TXT records for Bonjour discovery', () => {
  const service = '_http._tcp.local'
  const host = 'dsh.local'
  const port = 3080
  const addresses = ['192.168.1.111']

  const packet = buildServiceResponse(service, host, port, addresses, ['txtvers=1', 'path=/'])
  assert.ok(packet instanceof Buffer)
  assert.ok(packet.length > 50)

  // Validate packet header
  const flags = packet.readUInt16BE(2)
  assert.equal((flags & 0x8000) !== 0, true, 'Must be a DNS response')
  const anCount = packet.readUInt16BE(6)
  assert.ok(anCount >= 3, 'Must contain at least PTR, SRV, TXT (and A/AAAA) records')

  // Check that service name and target host are in the packet
  assert.ok(packet.includes(Buffer.from('_http')), 'Packet must include _http label')
  assert.ok(packet.includes(Buffer.from('dsh')), 'Packet must include dsh label')
})
