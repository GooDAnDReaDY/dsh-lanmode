import { verifyLanPin, recordPinAttempt, checkPinRateLimit, PIN_REQUIRED } from '../privileged.js'
import { readLimitedBody, rejectTooLarge } from '../body-limit.js'
// Cloudflare WAN tunnel management routes.
// Enforces admin verification and same-origin validation.
// Zero hardcoded Cyrillic characters.

export function registerTunnelRoutes(ctx, options) {
  const {
    state,
    config,
    tunnel,
    resolveSecret,
    resolveClientRole,
    verifyAdminAccess,
    isTrustedSameOrigin,
    routes = {},
  } = options

  const statusPath = routes.status || '/dsh-lanmode/tunnel'
  const togglePath = routes.toggle || '/dsh-lanmode/tunnel/toggle'

  // WAN tunnel status (Protected administrative endpoint)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: statusPath,
    handler: (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', 'allow': 'GET, HEAD' })
        res.end('Method Not Allowed')
        return
      }
      const ip = (req.socket && req.socket.remoteAddress) || ''
      const role = resolveClientRole(ip, {
        adminRules: state.adminRules,
        guestRules: state.guestRules,
        defaultRules: state.rules,
      })
      const auth = verifyAdminAccess(req, { state, config, clientIp: ip, role })
      if (!auth.ok) {
        res.writeHead(auth.status || 403, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: auth.error }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(tunnel.getState(), null, 2))
    },
  }), 'dsh-lanmode: WAN tunnel status')

  // Toggle Cloudflare WAN tunnel (Protected administrative endpoint)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: togglePath,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', 'allow': 'POST' })
        res.end('Method Not Allowed')
        return
      }
      const ip = (req.socket && req.socket.remoteAddress) || ''
      const role = resolveClientRole(ip, {
        adminRules: state.adminRules,
        guestRules: state.guestRules,
        defaultRules: state.rules,
      })
      const auth = verifyAdminAccess(req, { state, config, clientIp: ip, role })
      if (!auth.ok) {
        res.writeHead(auth.status || 403, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: auth.error }))
        return
      }
      if (typeof isTrustedSameOrigin === 'function' && !isTrustedSameOrigin(req, { state, config })) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'Cross-origin request rejected' }))
        return
      }
      let currentPin = state?.lanPinValue || config?.lanPin || ''
      const configuredPinRef = config?.lanPinRef || state?.config?.lanPinRef
      if (!currentPin && configuredPinRef && typeof resolveSecret === 'function') {
        try {
          const res = await resolveSecret(ctx, configuredPinRef, config?.lanPin || '')
          if (res) currentPin = String(res).trim()
        } catch (_) {}
      }
      if (configuredPinRef && !currentPin) {
        res.writeHead(503, {
          'content-type': 'application/json; charset=utf-8',
          'x-dsh-lan-pin-required': '1',
        })
        res.end(JSON.stringify({ error: 'LAN PIN reference configured but cannot be resolved' }))
        return
      }
      if (currentPin) {
        const limit = checkPinRateLimit(ip)
        if (!limit.allowed) {
          const retrySec = Math.ceil(limit.remainingMs / 1000)
          res.writeHead(429, {
            'content-type': 'application/json; charset=utf-8',
            'retry-after': String(retrySec),
            'x-dsh-lan-pin-retry-after': String(retrySec),
          })
          res.end(JSON.stringify({ error: 'Too many failed PIN attempts. Please retry in ' + retrySec + 's.' }))
          return
        }
        const valid = verifyLanPin(req.headers, currentPin)
        recordPinAttempt(ip, valid)
        if (!valid) {
          res.writeHead(403, {
            'content-type': 'application/json; charset=utf-8',
            'x-dsh-lan-pin-required': '1',
          })
          res.end(JSON.stringify({ error: PIN_REQUIRED }))
          return
        }
      }
      readLimitedBody(req).then(async (limited) => {
        if (!limited.ok) {
          rejectTooLarge(res, req)
          return
        }
        const body = limited.text
        try {
          const data = JSON.parse(body || '{}')
          const port = state.listener ? state.listener.port : (ctx.webServer?.port || 3088)
          const scheme = state.listener ? state.listener.scheme : 'http'
          const originServerName = state.mdnsName || 'dsh.local'
          const caPool = state.caCertPath || null
          if (data.enabled) {
            const liveToken = await resolveSecret(ctx, config.tunnelTokenRef, config.tunnelToken)
            if (liveToken) tunnel.token = liveToken
            const mode = data.mode || config.tunnel || tunnel.mode || 'quick'
            const hostname = data.hostname || config.tunnelHostname || tunnel.hostname || null
            await tunnel.start({ port, scheme, originServerName, caPool, mode, hostname, token: liveToken || tunnel.token })
          } else {
            tunnel.stop()
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(tunnel.getState()))
        } catch (err) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: err.message || String(err), status: tunnel.status }))
        }
      })
    },
  }), 'dsh-lanmode: toggle WAN tunnel')
}
