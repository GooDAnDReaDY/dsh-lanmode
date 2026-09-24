import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { ensureCertificate, inspect } from '../lib/tls.js'

test('saved certificate keeps its fingerprint when a new address appears', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cert-251-'))
  try {
    const first = await ensureCertificate({
      dir,
      hosts: ['localhost', '127.0.0.1'],
      log() {},
    })
    const info = inspect(first.cert)
    const fiftyYears = 50 * 365 * 24 * 60 * 60 * 1000
    assert.ok(info.expires > Date.now() + fiftyYears)

    const second = await ensureCertificate({
      dir,
      hosts: ['localhost', '127.0.0.1', '10.9.8.7'],
      log() {},
    })
    assert.equal(second.issued, false)
    assert.equal(second.fingerprint, first.fingerprint)
    assert.equal(fs.statSync(path.join(dir, 'lanmode-key.pem')).mode & 0o777, 0o600)
    assert.equal(fs.statSync(path.join(dir, 'lanmode-cert.pem')).mode & 0o777, 0o600)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
