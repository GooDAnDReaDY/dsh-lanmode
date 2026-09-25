// Merge and mint core dsh-auth cookies into proxied requests (#232, #261).
// Resolves secret from credentials or mints via loopback connection.

import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const NAME = /^dsh-auth-[A-Za-z0-9_-]+=/
const COOKIE_PREFIX = 'dsh-auth-'
const DAY_MS = 24 * 60 * 60 * 1000

export function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

export function decodeBase64Url(value) {
  if (typeof value !== 'string') return null
  const clean = value.trim()
  if (!clean || clean.length % 4 === 1) return null
  const padding = '='.repeat((4 - (clean.length % 4)) % 4)
  try {
    return Buffer.from(clean.replaceAll('-', '+').replaceAll('_', '/') + padding, 'base64')
  } catch (_) {
    return null
  }
}

export function cookieNameForAuthority(authority) {
  if (!authority) return ''
  const hash = crypto.createHash('sha256').update(String(authority).trim()).digest()
  return COOKIE_PREFIX + encodeBase64Url(hash)
}

export function hasCoreAuthCookie(cookieHeader, authority) {
  const current = String(cookieHeader ?? '').trim()
  if (!current) return false
  if (authority) {
    const expectedName = cookieNameForAuthority(authority)
    return current.split(';').some((part) => part.trim().startsWith(expectedName + '='))
  }
  return current.split(';').some((part) => NAME.test(part.trim()))
}

export function pickDshAuthCookie(setCookie) {
  const lines = Array.isArray(setCookie) ? setCookie : [setCookie]
  for (const line of lines) {
    const first = String(line ?? '').split(';')[0].trim()
    if (NAME.test(first)) return first
  }
  return ''
}

export function mergeDshAuthCookie(clientCookie, cachedPair) {
  const cached = String(cachedPair ?? '').trim()
  const current = String(clientCookie ?? '').trim()
  if (!cached || !NAME.test(cached)) return current
  if (current.split(';').some((part) => NAME.test(part.trim()))) return current
  return current ? current + '; ' + cached : cached
}

/**
 * Mint a signed dsh-auth-* session cookie using the browserAuth secret.
 * Exactly matches DSH core's BrowserAuth encoding & signing format.
 */
export function mintDshAuthCookie(authority, secretInput, maxAgeDays = 30) {
  if (!authority || !secretInput) return null
  const auth = String(authority).trim()
  let secretBuf = Buffer.isBuffer(secretInput) ? secretInput : null
  if (!secretBuf) {
    secretBuf = decodeBase64Url(secretInput)
  }
  if (!secretBuf || secretBuf.byteLength !== 32) return null

  const name = cookieNameForAuthority(auth)
  const issuedAt = Date.now()
  const maxAgeMs = maxAgeDays * DAY_MS
  const expiresAt = issuedAt + maxAgeMs
  const payload = {
    version: 1,
    authority: auth,
    issuedAt,
    expiresAt,
  }
  const body = encodeBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = encodeBase64Url(crypto.createHmac('sha256', secretBuf).update(body).digest())
  const value = `v1.${body}.${sig}`
  const pair = `${name}=${value}`
  const maxAgeSec = Math.floor(maxAgeMs / 1000)
  const expiresUtc = new Date(expiresAt).toUTCString()
  const setCookie = `${pair}; Max-Age=${maxAgeSec}; Path=/; Expires=${expiresUtc}; HttpOnly; SameSite=Strict`

  return { name, value, pair, setCookie, expiresAt }
}

/**
 * Synchronously or asynchronously resolve the browserAuth secret.
 * Inspects credentials service or ~/.dsh/.credentials.yaml.
 */
export function resolveBrowserAuthSecret(ctx) {
  // 1. Try ctx.credentials if available (guard cordis inject trap)
  try {
    const creds = ctx?.get?.('credentials') || ctx?.credentials
    if (creds && typeof creds.readRecord === 'function') {
      const rec = creds.readRecord('client-connection', 'browser-session')
      if (rec?.payload?.secret) return rec.payload.secret
    }
  } catch (_) {}
  // 2. Read ~/.dsh/.credentials.yaml
  try {
    const credPath = path.join(os.homedir(), '.dsh', '.credentials.yaml')
    if (fs.existsSync(credPath)) {
      const content = fs.readFileSync(credPath, 'utf8')
      const match = content.match(/client-connection\/browser-session:[^]*?secret:\s*([A-Za-z0-9_-]+)/)
      if (match && match[1]) {
        return match[1].trim()
      }
    }
  } catch (_) {}
  return ''
}

/**
 * Mint a core browserAuth cookie by performing an internal loopback GET
 * to the connection service's authenticatedUrl (#232).
 */
export function mintCoreAuthCookie(connection, { upstreamPort = 3080, authority = '127.0.0.1:3080' } = {}) {
  return new Promise((resolve) => {
    if (!connection || typeof connection.authenticatedUrl !== 'function') {
      return resolve('')
    }
    let authUrl = ''
    try {
      authUrl = connection.authenticatedUrl('http://' + authority)
    } catch (_) {
      return resolve('')
    }
    if (!authUrl) return resolve('')

    let path = '/'
    try {
      const parsed = new URL(authUrl)
      path = `${parsed.pathname}${parsed.search}` || '/'
    } catch (_) {
      return resolve('')
    }

    const req = http.request({
      host: '127.0.0.1',
      port: upstreamPort,
      method: 'GET',
      path,
      headers: { host: authority },
      timeout: 3000,
    }, (res) => {
      const cookie = pickDshAuthCookie(res.headers['set-cookie'])
      res.resume()
      resolve(cookie)
    })

    req.on('error', () => resolve(''))
    req.on('timeout', () => { req.destroy(); resolve('') })
    req.end()
  })
}
