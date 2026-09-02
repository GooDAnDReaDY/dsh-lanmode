import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { readRootCA, inspect, checkOpenSsl } from '../lib/tls.js'

test('проверка доступности openssl', async () => {
  const info = await checkOpenSsl()
  assert.equal(typeof info.available, 'boolean')
})

test('чтение Root CA из временной папки', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-ca-test-'))
  try {
    assert.equal(readRootCA(tmpDir), null)
    const dummyCA = '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----\n'
    fs.writeFileSync(path.join(tmpDir, 'lanmode-ca.pem'), dummyCA, 'utf8')
    assert.equal(readRootCA(tmpDir), dummyCA)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('altNames корректно форматирует DNS, IP и IPv6 в скобках', async () => {
  const { altNames } = await import('../lib/tls.js')
  const san = altNames(['localhost', '192.168.1.1', '[::1]', 'dsh.local', 'fd7a:115c::1'])
  assert.ok(san.includes('DNS:localhost'))
  assert.ok(san.includes('IP:192.168.1.1'))
  assert.ok(san.includes('IP:::1'))
  assert.ok(san.includes('DNS:dsh.local'))
  assert.ok(san.includes('IP:fd7a:115c::1'))
  assert.ok(!san.includes('['))
})
