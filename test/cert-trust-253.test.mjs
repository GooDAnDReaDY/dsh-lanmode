import assert from 'node:assert/strict'
import { X509Certificate } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { ensureCertificate, inspect, readRootCA } from '../lib/tls.js'
import { clientRuntimeSource } from './client-bundle.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Issue #253: Root CA DER encodes the same certificate as PEM', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-ca-der-'))
  try {
    await ensureCertificate({ dir, hosts: ['localhost', '127.0.0.1'], log() {} })
    const pem = readRootCA(dir)
    assert.ok(pem)
    const der = Buffer.from(new X509Certificate(pem).raw)
    assert.ok(der.length > 100)
    assert.equal(inspect(pem).fingerprint, new X509Certificate(der).fingerprint256)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('Issue #253: routes and QR UI expose fingerprint and install commands', () => {
  const diagnostics = readFileSync(path.join(here, '../lib/routes/diagnostics.js'), 'utf8')
  assert.ok(diagnostics.includes("/dsh-lanmode/ca.der"))
  assert.ok(diagnostics.includes('X509Certificate'))
  const client = clientRuntimeSource()
  assert.ok(client.includes('tlsFingerprint'))
  assert.ok(client.includes('certutil -addstore'))
  assert.ok(client.includes('security add-trusted-cert'))
  assert.ok(client.includes('update-ca-certificates'))
  assert.ok(client.includes('/dsh-lanmode/ca.der'))
})
