import assert from 'node:assert/strict'
import test from 'node:test'
import { parseUserAgent } from '../lib/devices.js'

test('Issue #181: friendly device names from User-Agent', () => {
  const iphone = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1')
  assert.equal(iphone.os, 'iPhone')
  assert.equal(iphone.name, 'iPhone iOS 17 · Safari')
  assert.ok(iphone.name.includes('iPhone'))

  const pixel = parseUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36')
  assert.equal(pixel.os, 'Android')
  assert.equal(pixel.name, 'Android Pixel 8 · Chrome')

  const win = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/122.0.0.0')
  assert.equal(win.name, 'Windows · Edge')
})
