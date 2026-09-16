// Device registry and session management routes.
// Enforces perimeter security, admin access validation and anti-CSRF same-origin checks.
// Zero hardcoded Cyrillic characters.

export function registerDeviceRoutes(ctx, options) {
  const {
    state,
    config,
    deviceRegistry,
    resolveClientRole,
    verifyAdminAccess,
    isTrustedSameOrigin,
    routes = {},
  } = options

  const devicesPath = routes.devices || '/dsh-lanmode/devices'
  const revokePath = routes.revoke || '/dsh-lanmode/devices/revoke'
  const killAllPath = routes.killAll || '/dsh-lanmode/devices/kill-all'

  // Devices roster (Protected administrative endpoint)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: devicesPath,
    handler: (req, res) => {
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
      res.end(JSON.stringify(deviceRegistry.list(), null, 2))
    },
  }), 'dsh-lanmode: device registry')

  // Revoke device session (Protected administrative endpoint)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: revokePath,
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
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        try {
          const data = JSON.parse(body)
          const ok = deviceRegistry.revoke(data.id)
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok }))
        } catch (_) {
          res.writeHead(400, { 'content-type': 'text/plain' })
          res.end('Bad Request')
        }
      })
    },
  }), 'dsh-lanmode: revoke device')

  // Reset all sessions (Protected administrative endpoint)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: killAllPath,
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
      deviceRegistry.revokeAll()
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, message: 'All sessions revoked' }))
    },
  }), 'dsh-lanmode: reset all sessions')
}
