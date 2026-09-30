import test from 'node:test'
import assert from 'node:assert/strict'
import { plainConfig } from '../lib/config-schema.js'
import { readCertificate } from '../lib/tls.js'

test('Issue #354: plainConfig correctly unwraps Cosmokit Volatile boxes at any nesting depth', () => {
  function volatile(value) {
    return {
      get() { return value },
      [Symbol.for('cosmokit.volatile.write')]: (next) => { value = next }
    }
  }

  const raw = {
    mode: 'files',
    tlsCert: volatile('/path/to/cert.pem'),
    tlsKey: volatile('/path/to/key.pem'),
    nested: {
      inner: volatile('nested-value'),
    },
    list: [volatile('item-1'), 'item-2'],
  }

  const unwrapped = plainConfig(raw)
  assert.equal(unwrapped.tlsCert, '/path/to/cert.pem')
  assert.equal(unwrapped.tlsKey, '/path/to/key.pem')
  assert.equal(unwrapped.nested.inner, 'nested-value')
  assert.deepEqual(unwrapped.list, ['item-1', 'item-2'])

  // Verify that passing volatile box directly to readCertificate throws TypeError
  assert.throws(() => {
    readCertificate(raw.tlsCert, raw.tlsKey)
  }, TypeError)

  // Verify that unwrapped config fields are strings acceptable by path/fs
  assert.equal(typeof unwrapped.tlsCert, 'string')
  assert.equal(typeof unwrapped.tlsKey, 'string')
})
