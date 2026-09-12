// Управление аутентификацией по логину и паролю и сессиями (#103).

import crypto from 'node:crypto'

export class AuthManager {
  /**
   * @param {object} [options]
   * @param {number} [options.sessionDurationMs] Срок жизни долгой сессии (по умолчанию 30 дней)
   * @param {object} [options.deviceRegistry] Опциональный реестр устройств
   */
  constructor(options = {}) {
    this.sessionDurationMs = options.sessionDurationMs ?? (30 * 24 * 60 * 60 * 1000)
    this.deviceRegistry = options.deviceRegistry || null
    this.maxSessions = options.maxSessions ?? 500
    /** @type {Map<string, { token: string, user: string, ip: string, userAgent: string, createdAt: number, expiresAt: number }>} */
    this.sessions = new Map()
    /** @type {Map<string, { count: number, lockedUntil: number, lastAttemptAt: number }>} */
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

  /**
   * Очистить устаревшие сессии и IP записи попыток авторизации (#119).
   */
  cleanupExpired() {
    const now = Date.now()
    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(token)
      }
    }
    for (const [ip, rec] of this.failedAttempts.entries()) {
      if (now - (rec.lastAttemptAt || 0) > 3600000) {
        this.failedAttempts.delete(ip)
      }
    }
  }

  /**
   * Безопасная проверка логина и пароля с защитой от тайминг-атак.
   * @param {string} username
   * @param {string} password
   * @param {string} expectedUser
   * @param {string} expectedPassword
   * @returns {boolean}
   */
  verifyCredentials(username, password, expectedUser, expectedPassword) {
    if (!expectedPassword || typeof password !== 'string') return false
    const cleanUser = String(username ?? '').trim()
    const cleanExpectedUser = String(expectedUser ?? '').trim()

    if (cleanUser !== cleanExpectedUser) return false

    const a = Buffer.from(password, 'utf8')
    const b = Buffer.from(expectedPassword, 'utf8')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  }

  /**
   * Создать сессию для пользователя.
   */
  createSession(user, req, rememberMe = true) {
    const token = crypto.randomBytes(32).toString('hex')
    const now = Date.now()
    const expiresAt = now + (rememberMe ? this.sessionDurationMs : (24 * 60 * 60 * 1000))
    const ip = req?.socket?.remoteAddress || ''
    const userAgent = req?.headers?.['user-agent'] || ''

    const session = {
      token,
      user,
      ip,
      userAgent,
      createdAt: now,
      expiresAt,
    }

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

  /**
   * Проверить валидность сессионного токена.
   */
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

  /**
   * Аннулировать сессию.
   */
  revokeSession(token) {
    if (!token) return false
    const deleted = this.sessions.delete(token)
    if (this.deviceRegistry && typeof this.deviceRegistry.revoke === 'function') {
      this.deviceRegistry.revoke(token)
    }
    return deleted
  }

  /**
   * Проверить лимит попыток ввода пароля (Rate Limit).
   */
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

  /**
   * Зафиксировать результат попытки авторизации.
   */
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
        rec.lockedUntil = now + 30000 // 30 секунд блокировки
        rec.count = 0
      }
    }
    if (this.failedAttempts.size > 1000) {
      this.cleanupExpired()
    }
  }

  /**
   * Извлечь токен сессии из заголовков запроса (Cookie, Authorization, x-dsh-auth-session).
   */
  extractToken(req) {
    if (!req || !req.headers) return null

    // 1. Cookie dsh_auth_session
    const cookie = req.headers['cookie'] || ''
    const match = cookie.match(/(?:^|;\s*)dsh_auth_session=([a-zA-Z0-9_-]+)/)
    if (match) return match[1]

    // 2. Authorization Bearer
    const auth = req.headers['authorization'] || ''
    const bearer = auth.match(/^Bearer\s+([a-zA-Z0-9_-]+)/i)
    if (bearer) return bearer[1]

    // 3. Заголовок x-dsh-auth-session или x-dsh-auth-token
    const custom = req.headers['x-dsh-auth-session'] || req.headers['x-dsh-auth-token']
    if (custom && typeof custom === 'string') return custom.trim()

    // 4. Query параметр auth_token (для начального перехода)
    if (req.url) {
      const q = req.url.match(/[?&]auth_token=([a-zA-Z0-9_-]+)/)
      if (q) return q[1]
    }

    return null
  }
}

/**
 * Сформировать заголовок Set-Cookie для сессии.
 */
export function makeSessionCookie(token, expiresAt, isSecure = false) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  let cookie = `dsh_auth_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  if (isSecure) cookie += '; Secure'
  return cookie
}

/**
 * Сформировать заголовок Set-Cookie для очистки сессии.
 */
export function clearSessionCookie() {
  return 'dsh_auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
}