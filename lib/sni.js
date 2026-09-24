// Choose a TLS certificate from the client server name.
// The default certificate stays the fallback for IP addresses and unknown names.

import tls from 'node:tls'
import { readCertificate } from './tls.js'

export function loadTlsSites(entries, log = () => {}, read = readCertificate) {
  const sites = []
  for (const site of entries || []) {
    const host = site && typeof site.host === 'string' ? site.host.trim().toLowerCase() : ''
    if (!host || !site.cert || !site.key) continue
    try {
      const loaded = read(site.cert, site.key)
      sites.push({ host, cert: loaded.cert, key: loaded.key })
    } catch (err) {
      log('site certificate skipped for ' + host + ': ' + String(err && err.message || err))
    }
  }
  return sites
}

export function selectSecureContext(servername, book) {
  const name = String(servername || '').trim().toLowerCase()
  if (name && book.named.has(name)) return book.named.get(name)
  return book.fallback
}

export function sniCallback(book) {
  return (servername, cb) => {
    cb(null, selectSecureContext(servername, book))
  }
}

export function tlsServerOptions(material) {
  const options = {
    cert: material.cert,
    key: material.key,
    allowHTTP1: true,
  }
  const sites = Array.isArray(material.sites) ? material.sites : []
  if (!sites.length) return options
  const named = new Map()
  for (const site of sites) {
    if (!site || !site.host || !site.cert || !site.key) continue
    named.set(String(site.host).toLowerCase(), tls.createSecureContext({ cert: site.cert, key: site.key }))
  }
  const book = {
    fallback: tls.createSecureContext({ cert: material.cert, key: material.key }),
    named,
  }
  options.SNICallback = sniCallback(book)
  return options
}
