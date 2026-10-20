import { getTailscaleFunnelStatus, setTailscaleFunnel } from '../tailscale.js'
import { verifyLanPin, recordPinAttempt, checkPinRateLimit, PIN_REQUIRED } from '../privileged.js'
import { readLimitedBody, rejectTooLarge } from '../body-limit.js'

function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers })
  res.end(typeof data === 'string' ? data : JSON.stringify(data, null, 2))
}

function checkTunnelAuth(req, res, options, method) {
  if (req.method !== method && (method !== 'GET' || req.method !== 'HEAD')) {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: method === 'GET' ? 'GET, HEAD' : method }).end('Method Not Allowed')
    return false
  }
  const ip = req.socket?.remoteAddress || ''
  let role = options.resolveClientRole(ip, {
    adminRules: options.state.adminRules,
    guestRules: options.state.guestRules,
    defaultRules: options.state.rules,
  })
  const currentPin = options.config?.lanPin || options.state?.lanPinValue || ''
  if (role === 'guest' && currentPin && verifyLanPin(req?.headers, currentPin)) {
    role = 'admin'
  }
  const auth = options.verifyAdminAccess(req, { state: options.state, config: options.config, clientIp: ip, role })
  if (!auth.ok) {
    json(res, auth.status || 403, { error: auth.error })
    return false
  }
  if (method === 'POST' && typeof options.isTrustedSameOrigin === 'function' && !options.isTrustedSameOrigin(req, { state: options.state, config: options.config })) {
    json(res, 403, { error: 'Cross-origin request rejected' })
    return false
  }
  return true
}

export function registerTunnelRoutes(ctx, options) {
  const { state, config, tunnel, resolveSecret, resolveClientRole, verifyAdminAccess, isTrustedSameOrigin, routes = {} } = options
  const opts = { state, config, resolveClientRole, verifyAdminAccess, isTrustedSameOrigin }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: routes.status || '/dsh-lanmode/tunnel',
    handler: (req, res) => {
      if (!checkTunnelAuth(req, res, opts, 'GET')) return
      json(res, 200, tunnel.getState())
    },
  }), 'dsh-lanmode: WAN tunnel status')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: routes.toggle || '/dsh-lanmode/tunnel/toggle',
    handler: async (req, res) => {
      if (!checkTunnelAuth(req, res, opts, 'POST')) return
      const ip = req.socket?.remoteAddress || ''
      const configuredPinRef = config?.lanPinRef || state?.config?.lanPinRef
      let currentPin = config?.lanPin || ''
      if (configuredPinRef && typeof resolveSecret === 'function') {
        try {
          const r = await resolveSecret(ctx, configuredPinRef, config?.lanPin || '')
          if (r) currentPin = String(r).trim()
        } catch {}
      } else if (!currentPin && state?.lanPinValue) {
        currentPin = state.lanPinValue
      }
      if (currentPin && state) {
        state.lanPinValue = currentPin
        state.lanPin = Boolean(currentPin)
      }
      if (configuredPinRef && !currentPin) {
        return json(res, 503, { error: 'LAN PIN reference configured but cannot be resolved' }, { 'x-dsh-lan-pin-required': '1' })
      }
      if (currentPin) {
        const limit = checkPinRateLimit(ip)
        if (!limit.allowed) {
          const retrySec = Math.ceil(limit.remainingMs / 1000)
          return json(res, 429, { error: 'Too many failed PIN attempts. Please retry in ' + retrySec + 's.' }, { 'retry-after': String(retrySec), 'x-dsh-lan-pin-retry-after': String(retrySec) })
        }
        const valid = verifyLanPin(req.headers, currentPin)
        recordPinAttempt(ip, valid)
        if (!valid) {
          return json(res, 403, { error: PIN_REQUIRED }, { 'x-dsh-lan-pin-required': '1' })
        }
      }
      readLimitedBody(req).then(async (limited) => {
        if (!limited.ok) return rejectTooLarge(res, req)
        try {
          const data = JSON.parse(limited.text || '{}')
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
          json(res, 200, tunnel.getState())
        } catch (err) {
          json(res, 500, { error: err.message || String(err), status: tunnel.status })
        }
      })
    },
  }), 'dsh-lanmode: toggle WAN tunnel')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: routes.tailscaleFunnelStatus || '/dsh-lanmode/api/tailscale/funnel/status',
    handler: (req, res) => {
      if (!checkTunnelAuth(req, res, opts, 'GET')) return
      json(res, 200, getTailscaleFunnelStatus())
    },
  }), 'dsh-lanmode: Tailscale Funnel status')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: routes.tailscaleFunnel || '/dsh-lanmode/api/tailscale/funnel',
    handler: (req, res) => {
      if (!checkTunnelAuth(req, res, opts, 'GET')) return
      json(res, 200, getTailscaleFunnelStatus())
    },
  }), 'dsh-lanmode: Tailscale Funnel status alias')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: routes.tailscaleFunnelEnable || '/dsh-lanmode/api/tailscale/funnel/enable',
    handler: (req, res) => {
      if (!checkTunnelAuth(req, res, opts, 'POST')) return
      try {
        const port = state.listener ? state.listener.port : (ctx.webServer?.port || 3088)
        const result = setTailscaleFunnel(true, { port })
        json(res, 200, result)
      } catch (err) {
        json(res, 500, { error: err.message || String(err), available: true, enabled: false })
      }
    },
  }), 'dsh-lanmode: enable Tailscale Funnel')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: routes.tailscaleFunnelDisable || '/dsh-lanmode/api/tailscale/funnel/disable',
    handler: (req, res) => {
      if (!checkTunnelAuth(req, res, opts, 'POST')) return
      try {
        const result = setTailscaleFunnel(false)
        json(res, 200, result)
      } catch (err) {
        json(res, 500, { error: err.message || String(err) })
      }
    },
  }), 'dsh-lanmode: disable Tailscale Funnel')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: routes.tailscaleFunnelToggle || '/dsh-lanmode/api/tailscale/funnel/toggle',
    handler: (req, res) => {
      if (!checkTunnelAuth(req, res, opts, 'POST')) return
      readLimitedBody(req).then((limited) => {
        if (!limited.ok) return rejectTooLarge(res, req)
        try {
          const data = JSON.parse(limited.text || '{}')
          const current = getTailscaleFunnelStatus()
          const target = typeof data.enabled === 'boolean' ? data.enabled : !current.enabled
          const port = Number(data.port) || (state.listener ? state.listener.port : (ctx.webServer?.port || 3088))
          const result = setTailscaleFunnel(target, { port })
          json(res, 200, result)
        } catch (err) {
          json(res, 500, { error: err.message || String(err) })
        }
      })
    },
  }), 'dsh-lanmode: toggle Tailscale Funnel')

}
