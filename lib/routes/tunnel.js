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

  // WAN tunnel status
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: statusPath,
    handler: (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(tunnel.getState(), null, 2))
    },
  }), 'dsh-lanmode: WAN tunnel status')

  // Toggle Cloudflare WAN tunnel (Protected administrative endpoint)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: togglePath,
    handler: (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'text/plain' })
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
      if (typeof isTrustedSameOrigin === 'function' && !isTrustedSameOrigin(req)) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'Cross-origin request rejected' }))
        return
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
          if (data.enabled) {
            const liveToken = await resolveSecret(ctx, config.tunnelTokenRef, config.tunnelToken)
            if (liveToken) tunnel.token = liveToken
            await tunnel.start({ port })
          } else {
            tunnel.stop()
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(tunnel.getState()))
        } catch (err) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: err.message || String(err) }))
        }
      })
    },
  }), 'dsh-lanmode: toggle WAN tunnel')
}
