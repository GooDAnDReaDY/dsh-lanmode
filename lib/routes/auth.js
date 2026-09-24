import { readLimitedBody, rejectTooLarge } from '../body-limit.js'
// Authentication routes (login, logout, session state).
// Zero hardcoded Cyrillic characters.

export function registerAuthRoutes(ctx, options) {
  const {
    state,
    config,
    authManager,
    resolveSecret,
    makeSessionCookie,
    clearSessionCookie,
    routes = {},
  } = options

  const loginPath = routes.login || '/dsh-lanmode/auth/login'
  const logoutPath = routes.logout || '/dsh-lanmode/auth/logout'
  const sessionPath = routes.session || '/dsh-lanmode/auth/session'

  // Login handler
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: loginPath,
    handler: (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'text/plain' })
        res.end('Method Not Allowed')
        return
      }
      readLimitedBody(req).then(async (limited) => {
        if (!limited.ok) {
          rejectTooLarge(res, req)
          return
        }
        const body = limited.text
        try {
          let data = {}
          if (req.headers['content-type']?.includes('application/json')) {
            data = JSON.parse(body || '{}')
          } else {
            const params = new URLSearchParams(body)
            data = {
              username: params.get('username'),
              password: params.get('password'),
              remember: params.get('remember') !== 'false',
            }
          }

          const ip = req.socket?.remoteAddress || ''
          const limit = authManager.checkRateLimit(ip)
          if (!limit.allowed) {
            const retrySec = Math.ceil(limit.remainingMs / 1000)
            res.writeHead(429, {
              'content-type': 'application/json; charset=utf-8',
              'retry-after': String(retrySec),
            })
            res.end(JSON.stringify({ error: 'Too many failed attempts', retryAfter: retrySec }))
            return
          }

          const expectedUser = config.authUser || 'admin'
          const expectedPassword = await resolveSecret(ctx, config.authPasswordRef, config.authPassword)

          const valid = authManager.verifyCredentials(data.username, data.password, expectedUser, expectedPassword)
          authManager.recordAttempt(ip, valid)

          if (!valid) {
            res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'Invalid username or password' }))
            return
          }

          const session = authManager.createSession(data.username, req, data.remember !== false)
          const isSecure = Boolean(state.tls?.enabled)
          const cookie = makeSessionCookie(session.token, session.expiresAt, isSecure)

          if (!req.headers['content-type']?.includes('application/json')) {
            res.writeHead(303, {
              'location': '/',
              'set-cookie': cookie,
            })
            res.end()
            return
          }

          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'set-cookie': cookie,
          })
          res.end(JSON.stringify({ ok: true, username: data.username, expiresAt: session.expiresAt }))
        } catch (err) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: err.message || String(err) }))
        }
      })
    },
  }), 'dsh-lanmode: login auth')

  // Logout handler
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: logoutPath,
    handler: (req, res) => {
      const token = authManager.extractToken(req)
      if (token) authManager.revokeSession(token)
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'set-cookie': clearSessionCookie(),
      })
      res.end(JSON.stringify({ ok: true }))
    },
  }), 'dsh-lanmode: logout auth')

  // Session state endpoint
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: sessionPath,
    handler: (req, res) => {
      const token = authManager.extractToken(req)
      const session = token ? authManager.validateSession(token) : null
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        enabled: Boolean(config.passwordAuth),
        authenticated: Boolean(session),
        user: session ? session.user : null,
      }))
    },
  }), 'dsh-lanmode: auth session status')
}
