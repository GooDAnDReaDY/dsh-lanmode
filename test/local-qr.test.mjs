import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateQRSvg } from '../lib/qr.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = readFileSync(path.join(here, '..', 'lib', 'qr.js'), 'utf8')

test('Issue #263: QR generator is self-contained without network calls', () => {
  assert.ok(!/\bfetch\s*\(/.test(src))
  assert.ok(!/https?:\/\/chart\.googleapis\.com/.test(src))
  assert.ok(!/qrserver\.com/.test(src))
  assert.ok(src.includes('Self-contained SVG QR'))
})

test('Issue #263: generateQRSvg returns inline SVG for otpauth payload', () => {
  const svg = generateQRSvg('otpauth://totp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example', { size: 128 })
  assert.ok(typeof svg === 'string')
  assert.ok(svg.includes('<svg'))
  assert.ok(svg.includes('</svg>'))
  assert.ok(!svg.includes('http://') && !svg.includes('https://') || svg.includes('xmlns'))
})
