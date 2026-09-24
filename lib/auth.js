// Authentication and session lifecycle management.

import crypto from 'node:crypto'

/** scrypt params for auth passwords (Issue #248). */
export const SCRYPT_N = 16384
export const SCRYPT_R = 8
export const SCRYPT_P = 1
export const SCRYPT_KEYLEN = 32

const DUMMY_SCRYPT = (() => {
  // Fixed dummy digest so unknown-user paths pay similar CPU (Issue #275).
  const salt = Buffer.alloc(16, 7)
  return crypto.scryptSync('dsh-lanmode-dummy', salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  })
})()


/**
 * Hash a password for at-rest storage.
 * Format: scrypt$N$r$p$saltHex$hashHex
 */
export function hashAuthPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(String(password ?? ''), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`
}

function safeEqualBuffers(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) {
    const x = Buffer.isBuffer(a) && a.length ? a : Buffer.alloc(32)
    crypto.timingSafeEqual(x, x)
    return false
  }
  return crypto.timingSafeEqual(a, b)
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

function verifyPasswordSecret(password, expectedPassword) {
  const target = String(expectedPassword ?? '')
  const candidate = String(password ?? '')
  if (!target) return false

  if (target.startsWith('scrypt$')) {
    const parts = target.split('$')
    if (parts.length !== 6) return false
    const [, nStr, rStr, pStr, saltHex, hashHex] = parts
    const N = Number(nStr)
    const r = Number(rStr)
    const p = Number(pStr)
    if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return false
    let salt
    let expectedHash
    try {
      salt = Buffer.from(saltHex, 'hex')
      expectedHash = Buffer.from(hashHex, 'hex')
    } catch (_) {
      return false
    }
    if (!salt.length || !expectedHash.length) return false
    const actual = crypto.scryptSync(candidate, salt, expectedHash.length, { N, r, p })
    return safeEqualBuffers(actual, expectedHash)
  }

  return safeEqualStrings(candidate, target)
}

export class AuthManager {
  constructor(options = {}) {
    this.sessionDurationMs = options.sessionDurationMs ?? (30 * 24 * 60 * 60 * 1000)
    this.deviceRegistry = options.deviceRegistry || null
    this.maxSessions = options.maxSessions ?? 500
    this.sessions = new Map()
    this.failedAttempts = new Map()
    this._cleanupTimer = setInterval(() => this.cleanupExpired(), 3600000)
    if (this._cleanupTimer.unref) this._cleanupTimer.unref()
  }

  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer)
      this._cleanupTimer = null
    }
  }

  cleanupExpired() {
    const now = Date.now()
    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) this.sessions.delete(token)
    }
    for (const [ip, rec] of this.failedAttempts.entries()) {
      if (now - (rec.lastAttemptAt || 0) > 3600000) this.failedAttempts.delete(ip)
    }
  }

  /**
   * Uniform 401 path helper: unknown usernames and wrong passwords both pay
   * one scrypt, and usernames are compared with timingSafeEqual (#275).
   */
  verifyCredentials(username, password, expectedUser, expectedPassword) {
    const cleanUser = String(username ?? '').trim()
    const cleanExpectedUser = String(expectedUser ?? '').trim()
    const userOk = Boolean(expectedPassword) && typeof password === 'string'
      && safeEqualStrings(cleanUser, cleanExpectedUser)

    let passOk = false
    if (userOk) {
      passOk = verifyPasswordSecret(password, expectedPassword)
      if (!String(expectedPassword).startsWith('scrypt$')) {
        const actual = crypto.scryptSync(String(password), Buffer.alloc(16, 7), SCRYPT_KEYLEN, {
          N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
        })
        safeEqualBuffers(actual, DUMMY_SCRYPT)
      }
    } else {
      const actual = crypto.scryptSync(String(password ?? ''), Buffer.alloc(16, 7), SCRYPT_KEYLEN, {
        N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
      })
      safeEqualBuffers(actual, DUMMY_SCRYPT)
    }

    return Boolean(userOk && passOk)
  }

  createSession(user, req, rememberMe = true) {
    const token = crypto.randomBytes(32).toString('hex')
    const now = Date.now()
    const expiresAt = now + (rememberMe ? this.sessionDurationMs : (24 * 60 * 60 * 1000))
    const ip = req?.socket?.remoteAddress || ''
    const userAgent = req?.headers?.['user-agent'] || ''
    const session = { token, user, ip, userAgent, createdAt: now, expiresAt }
    this.sessions.set(token, session)
    if (this.sessions.size > this.maxSessions) {
      const oldest = [...this.sessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)
      while (this.sessions.size > this.maxSessions && oldest.length > 0) {
        const [oldToken] = oldest.shift()
        this.sessions.delete(oldToken)
      }
    }
    if (this.deviceRegistry && typeof this.deviceRegistry.touch === 'function') {
      this.deviceRegistry.touch(token, req)
    }
    return session
  }

  validateSession(token) {
    if (!token || typeof token !== 'string') return null
    const session = this.sessions.get(token)
    if (!session) return null
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token)
      return null
    }
    if (this.deviceRegistry && typeof this.deviceRegistry.isRevoked === 'function') {
      if (this.deviceRegistry.isRevoked(token)) {
        this.sessions.delete(token)
        return null
      }
    }
    return session
  }

  revokeSession(token) {
    if (!token) return false
    const deleted = this.sessions.delete(token)
    if (this.deviceRegistry && typeof this.deviceRegistry.revoke === 'function') {
      this.deviceRegistry.revoke(token)
    }
    return deleted
  }

  checkRateLimit(ip) {
    if (!ip) return { allowed: true, remainingMs: 0 }
    const rec = this.failedAttempts.get(ip)
    if (!rec) return { allowed: true, remainingMs: 0 }
    const now = Date.now()
    if (rec.lockedUntil && rec.lockedUntil > now) {
      return { allowed: false, remainingMs: rec.lockedUntil - now }
    }
    return { allowed: true, remainingMs: 0 }
  }

  recordAttempt(ip, success) {
    if (!ip) return
    const now = Date.now()
    if (success) {
      this.failedAttempts.delete(ip)
      return
    }
    let rec = this.failedAttempts.get(ip)
    if (!rec) {
      rec = { count: 1, lockedUntil: 0, lastAttemptAt: now }
      this.failedAttempts.set(ip, rec)
    } else {
      rec.lastAttemptAt = now
      rec.count++
      if (rec.count >= 5) {
        rec.lockedUntil = now + 30000
        rec.count = 0
      }
    }
    if (this.failedAttempts.size > 1000) this.cleanupExpired()
  }

  extractToken(req) {
    if (!req || !req.headers) return null
    const cookie = req.headers['cookie'] || ''
    const match = cookie.match(/(?:^|;\s*)dsh_auth_session=([a-zA-Z0-9_-]+)/)
    if (match) return match[1]
    const auth = req.headers['authorization'] || ''
    const bearer = auth.match(/^Bearer\s+([a-zA-Z0-9_-]+)/i)
    if (bearer) return bearer[1]
    const custom = req.headers['x-dsh-auth-session'] || req.headers['x-dsh-auth-token']
    if (custom && typeof custom === 'string') return custom.trim()
    if (req.url) {
      const q = req.url.match(/[?&]auth_token=([a-zA-Z0-9_-]+)/)
      if (q) return q[1]
    }
    return null
  }
}

export function makeSessionCookie(token, expiresAt, isSecure = false) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  let cookie = `dsh_auth_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  if (isSecure) cookie += '; Secure'
  return cookie
}

export function clearSessionCookie() {
  return 'dsh_auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
}
