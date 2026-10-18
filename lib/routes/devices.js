import { readLimitedBody, rejectTooLarge } from '../body-limit.js'

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(typeof data === 'string' ? data : JSON.stringify(data, null, 2))
}

function checkAccess(req, res, options, method) {
  if (req.method !== method && (method !== 'GET' || req.method !== 'HEAD')) {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: method === 'GET' ? 'GET, HEAD' : method })
    res.end('Method Not Allowed')
    return false
  }
  const ip = req.socket?.remoteAddress || ''
  const role = options.resolveClientRole(ip, {
    adminRules: options.state.adminRules,
    guestRules: options.state.guestRules,
    defaultRules: options.state.rules,
  })
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

export function registerDeviceRoutes(ctx, options) {
  const { state, config, deviceRegistry, pushManager, resolveClientRole, verifyAdminAccess, isTrustedSameOrigin, routes = {} } = options
  const opts = { state, config, resolveClientRole, verifyAdminAccess, isTrustedSameOrigin }

  const reg = (path, name, handler) => ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, handler }), name)

  reg(routes.devices || '/dsh-lanmode/devices', 'dsh-lanmode: device registry', (req, res) => {
    if (!checkAccess(req, res, opts, 'GET')) return
    json(res, 200, deviceRegistry.list())
  })

  reg(routes.nickname || '/dsh-lanmode/devices/nickname', 'dsh-lanmode: set device nickname', (req, res) => {
    if (!checkAccess(req, res, opts, 'POST')) return
    readLimitedBody(req).then((l) => {
      if (!l.ok) return rejectTooLarge(res, req)
      try {
        const d = JSON.parse(l.text || '{}')
        if (!d.id) return json(res, 400, { error: 'Device ID required' })
        const ok = deviceRegistry.setNickname(d.id, d.nickname || '')
        if (ok === false) return json(res, 500, { ok: false, error: 'Failed to persist device nickname' })
        json(res, 200, { ok: true, nickname: d.nickname || '' })
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain' }).end('Bad Request')
      }
    })
  })

  reg(routes.revoke || '/dsh-lanmode/devices/revoke', 'dsh-lanmode: revoke device session', (req, res) => {
    if (!checkAccess(req, res, opts, 'POST')) return
    readLimitedBody(req).then((l) => {
      if (!l.ok) return rejectTooLarge(res, req)
      try {
        const d = JSON.parse(l.text || '{}')
        if (!d.id) return json(res, 400, { error: 'Device ID required' })
        const ok = deviceRegistry.revoke(d.id)
        if (ok === false) return json(res, 500, { ok: false, error: 'Failed to persist revocation' })
        const ip = req.socket?.remoteAddress || ''
        const h = req.headers || {}
        const isCurrent = (d.id === (h['x-dsh-device-id'] || h['x-device-id']) || (d.id === h.authorization?.slice(7)) || (d.id === ip))
        json(res, 200, { ok: true, revokedId: d.id, isCurrentDevice: isCurrent })
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain' }).end('Bad Request')
      }
    })
  })

  reg(routes.killAll || '/dsh-lanmode/devices/kill-all', 'dsh-lanmode: reset all sessions', (req, res) => {
    if (!checkAccess(req, res, opts, 'POST')) return
    readLimitedBody(req).then((l) => {
      if (!l.ok) return rejectTooLarge(res, req)
      try {
        const d = JSON.parse(l.text || '{}')
        const ok = d.keepCurrent ? deviceRegistry.revokeAllExcept(d.currentId) : deviceRegistry.revokeAll()
        if (ok === false) return json(res, 500, { ok: false, error: 'Failed to persist kill-all action' })
        if (state.activeSocketsTracker?.evictAllSockets) state.activeSocketsTracker.evictAllSockets(d.keepCurrent ? d.currentId : null)
        json(res, 200, { ok: true, mode: d.keepCurrent ? 'kill-others' : 'kill-all' })
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain' }).end('Bad Request')
      }
    })
  })

  reg(routes.sessions || '/dsh-lanmode/api/sessions', 'dsh-lanmode: active sessions live view', (req, res) => {
    if (!checkAccess(req, res, opts, 'GET')) return
    const sessions = typeof state.activeSocketsTracker?.listActiveSessions === 'function' ? state.activeSocketsTracker.listActiveSessions() : []
    json(res, 200, { ok: true, count: sessions.length, sessions })
  })

  reg(routes.vapidPublicKey || '/dsh-lanmode/api/push/vapid-public-key', 'dsh-lanmode: get VAPID public key', (req, res) => {
    if (!checkAccess(req, res, opts, 'GET')) return
    const publicKey = pushManager?.getPublicKey ? pushManager.getPublicKey() : ''
    json(res, 200, { ok: true, publicKey })
  })

  reg(routes.pushSubscribe || '/dsh-lanmode/api/push/subscribe', 'dsh-lanmode: subscribe to push notifications', (req, res) => {
    if (!checkAccess(req, res, opts, 'POST')) return
    readLimitedBody(req).then((l) => {
      if (!l.ok) return rejectTooLarge(res, req)
      try {
        const d = JSON.parse(l.text || '{}')
        const s = d.subscription
        if (!s || !s.endpoint || !s.keys) return json(res, 400, { error: 'Invalid subscription object' })
        const ok = deviceRegistry.savePushSubscription(d.deviceId, s)
        json(res, 200, { ok })
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain' }).end('Bad Request')
      }
    })
  })

  reg(routes.pushUnsubscribe || '/dsh-lanmode/api/push/unsubscribe', 'dsh-lanmode: unsubscribe from push notifications', (req, res) => {
    if (!checkAccess(req, res, opts, 'POST')) return
    readLimitedBody(req).then((l) => {
      if (!l.ok) return rejectTooLarge(res, req)
      try {
        const d = JSON.parse(l.text || '{}')
        const removed = deviceRegistry.removePushSubscription(String(d.endpoint || ''))
        json(res, 200, { ok: true, removed })
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain' }).end('Bad Request')
      }
    })
  })

  reg(routes.pushTest || '/dsh-lanmode/api/push/test', 'dsh-lanmode: send test push notification', (req, res) => {
    if (!checkAccess(req, res, opts, 'POST')) return
    if (!pushManager) return json(res, 503, { ok: false, error: 'Push manager unavailable' })
    pushManager.broadcastNotification({
      title: 'DeepSeek Harness',
      body: 'Test notification from LanMode',
      tag: 'dsh-test-push',
      data: { url: '/' },
    }).then((result) => json(res, 200, { ok: true, ...result }))
      .catch((err) => json(res, 500, { ok: false, error: err?.message || String(err) }))
  })

  reg(routes.pushApprovalRespond || '/dsh-lanmode/api/push/approval/respond', 'dsh-lanmode: respond to approval push action', (req, res) => {
    if (!checkAccess(req, res, opts, 'POST')) return
    readLimitedBody(req).then((l) => {
      if (!l.ok) return rejectTooLarge(res, req)
      try {
        const d = JSON.parse(l.text || '{}')
        const { id, action } = d
        if (!id || !['approve', 'reject'].includes(action)) {
          return json(res, 400, { ok: false, error: 'Invalid id or action' })
        }
        if (!pushManager) return json(res, 503, { ok: false, error: 'Push manager unavailable' })
        const result = pushManager.resolveApproval(id, action)
        if (ctx?.emit) {
          try { ctx.emit('approval/respond', { id, action, approved: action === 'approve' }) } catch (_) {}
        }
        json(res, 200, { ok: true, ...result })
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain' }).end('Bad Request')
      }
    })
  })
}