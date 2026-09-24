// Privileged API access controls and LAN PIN protection.
//
// Certain sensitive endpoints (settings, credentials, agent presets, model discovery)
// are restricted to loopback origin by default in DeepSeek Harness core.
//
// The bridge polyfills Host and Origin headers. To secure the server across LAN:
// 1. unlockPrivileged: master toggle permitting remote settings access.
// 2. lanPin: optional PIN challenge for remote clients trying to call privileged APIs.
//
// Issue #206: PIN secrets may be stored as PBKDF2 digests; failed attempts lock
// the client IP for 15 minutes after five consecutive failures.

import crypto from 'node:crypto'

export const PRIVILEGED = [
  /^\/api\/settings\.(describe|openDocument|update|replace|mutate)$/,
  /^\/api\/credentials\.(describe|set|unset)$/,
  /^\/api\/agentPreset\.(read|copy|openDocument|remove)$/,
  /^\/api\/host\.(pickDirectory|openPath)$/,
  /^\/api\/llm\.discoverModels$/,
]

export const PIN_LOCK_MS = 15 * 60 * 1000
export const PBKDF2_ITERATIONS = 100_000
export const PBKDF2_KEYLEN = 32
export const PBKDF2_DIGEST = 'sha512'

/** Check if a given URL path is a privileged endpoint. */
export function isPrivileged(url, extra) {
  const path = String(url ?? '').split('?')[0]
  if (!path) return false
  for (const rule of PRIVILEGED) if (rule.test(path)) return true
  for (const rule of extra ?? []) {
    try {
      if (new RegExp(rule).test(path)) return true
    } catch (_) {
      // Invalid user regex should not crash the bridge
    }
  }
  return false
}

function safeEqualStrings(a, b) {
  const left = Buffer.from(String(a), 'utf8')
  const right = Buffer.from(String(b), 'utf8')
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left)
    return false
  }
  return crypto.timingSafeEqual(left, right)
}

/**
 * Hash a LAN PIN for at-rest storage.
 * Format: pbkdf2$<digest>$<iterations>$<saltHex>$<hashHex>
 */
export function hashLanPin(pin) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.pbkdf2Sync(
    String(pin ?? ''),
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST,
  )
  return `pbkdf2$${PBKDF2_DIGEST}$${PBKDF2_ITERATIONS}$${salt.toString('hex')}$${hash.toString('hex')}`
}

function verifyPinSecret(provided, expected) {
  const target = String(expected ?? '').trim()
  const candidate = String(provided ?? '').trim()
  if (!target) return true

  if (target.startsWith('pbkdf2$')) {
    const parts = target.split('$')
    if (parts.length !== 5) return false
    const [, digest, iterStr, saltHex, hashHex] = parts
    const iterations = Number(iterStr)
    if (!digest || !Number.isInteger(iterations) || iterations < 1) return false
    let salt
    let expectedHash
    try {
      salt = Buffer.from(saltHex, 'hex')
      expectedHash = Buffer.from(hashHex, 'hex')
    } catch (_) {
      return false
    }
    if (!salt.length || !expectedHash.length) return false
    const actual = crypto.pbkdf2Sync(candidate, salt, iterations, expectedHash.length, digest)
    if (actual.length !== expectedHash.length) return false
    return crypto.timingSafeEqual(actual, expectedHash)
  }

  return safeEqualStrings(candidate, target)
}

/** Verify client PIN from headers or cookies. */
export function verifyLanPin(headers, expectedPin) {
  if (!expectedPin || typeof expectedPin !== 'string' || expectedPin.trim() === '') return true

  const pinHeader = headers?.['x-dsh-lan-pin']
  if (pinHeader && verifyPinSecret(String(pinHeader), expectedPin)) return true

  const cookies = String(headers?.cookie ?? '')
  const match = cookies.match(/(?:^|;\s*)dsh_lan_pin=([^;]+)/)
  if (match) {
    let raw = match[1]
    try {
      raw = decodeURIComponent(match[1])
    } catch (_) {
      // keep raw
    }
    if (verifyPinSecret(raw, expectedPin)) return true
  }

  return false
}

const failedAttempts = new Map()

/** Verify PIN rate limiting for client IP. */
export function checkPinRateLimit(ip) {
  if (!ip) return { allowed: true }
  const rec = failedAttempts.get(ip)
  if (!rec) return { allowed: true }
  const now = Date.now()
  if (rec.lockedUntil && rec.lockedUntil > now) {
    return { allowed: false, remainingMs: rec.lockedUntil - now }
  }
  return { allowed: true }
}

/** Record PIN attempt result. */
export function recordPinAttempt(ip, success) {
  if (!ip) return
  const now = Date.now()
  if (success) {
    failedAttempts.delete(ip)
    return
  }
  let rec = failedAttempts.get(ip)
  if (!rec) {
    rec = { count: 1, lockedUntil: 0 }
    failedAttempts.set(ip, rec)
  } else {
    rec.count++
    if (rec.count >= 5) {
      rec.lockedUntil = now + PIN_LOCK_MS
      rec.count = 0
    }
  }
}

export const REFUSED = 'dsh-lanmode: privileged call locked to loopback. Enable unlockPrivileged in settings to permit network access.'

export const PIN_REQUIRED = 'dsh-lanmode: PIN authentication required (x-dsh-lan-pin or cookie dsh_lan_pin) to access privileged settings.'

/**
 * Challenge PIN and rate limiting. Returns true if allowed, false if response already sent.
 */
export function challengePin(req, res, lanPin) {
  const ip = (req.socket && req.socket.remoteAddress) || ''
  const limit = checkPinRateLimit(ip)
  if (!limit.allowed) {
    const retrySec = Math.ceil(limit.remainingMs / 1000)
    res.writeHead(429, {
      'content-type': 'text/plain; charset=utf-8',
      'retry-after': String(retrySec),
      'x-dsh-lan-pin-retry-after': String(retrySec),
    })
    res.end('Too many failed PIN attempts. Please retry in ' + retrySec + 's.')
    return false
  }

  const valid = verifyLanPin(req.headers, lanPin)
  recordPinAttempt(ip, valid)
  if (!valid) {
    res.writeHead(403, {
      'content-type': 'text/plain; charset=utf-8',
      'x-dsh-lan-pin-required': '1',
    })
    res.end(PIN_REQUIRED)
    return false
  }
  return true
}

/** Clear one IP lock, or every lock when ip is omitted. Tests call this between cases. A lock ends by itself after 15 minutes. */
export function resetPinRateLimit(ip) {
  if (ip) failedAttempts.delete(ip)
  else failedAttempts.clear()
}
