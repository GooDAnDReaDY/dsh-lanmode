import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTlsSites, selectSecureContext, sniCallback, tlsServerOptions } from '../lib/sni.js'

test('Issue #254: a known server name uses its certificate and everything else uses the fallback', () => {
  const book = {
    fallback: { name: 'fallback' },
    named: new Map([['lan.example', { name: 'public' }]]),
  }
  assert.equal(selectSecureContext('LAN.example', book).name, 'public')
  assert.equal(selectSecureContext('127.0.0.1', book).name, 'fallback')
  assert.equal(selectSecureContext('', book).name, 'fallback')
  let chosen = null
  sniCallback(book)('lan.example', (_err, ctx) => { chosen = ctx })
  assert.equal(chosen.name, 'public')
})

test('Issue #254: no extra sites keeps a single certificate and does not install SNI', () => {
  const options = tlsServerOptions({ cert: 'default-cert', key: 'default-key', sites: [] })
  assert.equal(options.cert, 'default-cert')
  assert.equal(options.allowHTTP1, true)
  assert.equal(options.SNICallback, undefined)
})

test('Issue #254: a broken site certificate is skipped and the rest are kept', () => {
  const notes = []
  const sites = loadTlsSites([
    { host: 'Bad.Example', cert: 'missing', key: 'missing' },
    { host: ' Good.Example ', cert: 'cert-path', key: 'key-path' },
  ], (line) => notes.push(line), (cert, key) => {
    if (cert === 'missing') throw new Error('enoent')
    return { cert, key }
  })
  assert.equal(sites.length, 1)
  assert.equal(sites[0].host, 'good.example')
  assert.equal(notes.length, 1)
})
