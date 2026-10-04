// WebSocket and connection upgrade handler for Direct Bridge.
// Proxies WebSocket connections to upstream harness loopback port,
// validates authentication, session tokens and manages duplex stream lifecycles.
// Zero hardcoded Cyrillic characters.

import http from 'node:http'
import { clientIp, verifyBridgeOrigin } from './bridge-utils.js'
import { resolveClientRole, parseAllow } from './access.js'
import { isPrivileged, verifyLanPin, checkPinRateLimit, recordPinAttempt } from './privileged.js'
import { isCloudflareRequest } from './tunnel.js'
import { digestToken } from './auth.js'
import { hashToken } from './devices.js'

function sendReject(socket, status, message) {
  try {
    socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${message}\r\n`)
  } catch (err) {
    try { socket.destroy() } catch (e) { /* bestEffort */ void e }
  }
}

export function handleUpgrade(req, socket, head, options) {
  const {
    welcome,
    isPasswordAuth,
    authManager,
    deviceRegistry,
    rewritten,
    authority,
    upstreamPort,
    safeDestroy,
    trustedProxyCidrs,
    banList,
    adminRules,
    guestRules,
    rules,
    privilegedExtra,
    lanPin,
    unlocked,
    tunnelPin,
    activeSocketsRegistry,
  } = options

  const remote = clientIp(req, trustedProxyCidrs)

  if (!welcome(remote)) {
    sendReject(socket, 403, 'Forbidden')
    return
  }

  if (banList && ((typeof banList.has === 'function' && banList.has(remote)) || (typeof banList.isBanned === 'function' && banList.isBanned(remote)))) {
    sendReject(socket, 403, 'Forbidden: IP is banned')
    return
  }

  // Cross-origin check (#367)
  const origin = req.headers.origin || req.headers.Origin
  if (origin) {
    if (!verifyBridgeOrigin(req, options.options || options)) {
      sendReject(socket, 403, 'Forbidden: Cross-site upgrade request rejected')
      return
    }
  }

  const toRules = (r) => {
    if (!Array.isArray(r) || r.length === 0) return []
    if (r[0] && typeof r[0] === 'object' && 'bytes' in r[0]) return r
    return parseAllow(r).rules
  }

  const role = resolveClientRole(remote, {
    adminRules: toRules(adminRules),
    guestRules: toRules(guestRules),
    defaultRules: toRules(rules),
  })

  const privileged = isPrivileged(req.url, privilegedExtra)
  if (role === 'guest' && privileged) {
    sendReject(socket, 403, 'Forbidden: Guest access does not permit privileged actions')
    return
  }

  if (privileged && unlocked === false) {
    sendReject(socket, 403, 'Forbidden: Privileged call locked to loopback')
    return
  }

  const isCfTunnel = Boolean(tunnelPin && isCloudflareRequest(req.headers, req.socket && req.socket.remoteAddress, trustedProxyCidrs))
  if (lanPin && (isCfTunnel || privileged)) {
    const limit = checkPinRateLimit(remote)
    if (!limit.allowed) {
      sendReject(socket, 429, 'Too many failed PIN attempts')
      return
    }
    const valid = verifyLanPin(req.headers, lanPin)
    recordPinAttempt(remote, valid)
    if (!valid) {
      sendReject(socket, 403, 'Forbidden: LAN PIN authentication required')
      return
    }
  }

  let sessionToken = null
  if (isPasswordAuth() && authManager) {
    sessionToken = authManager.extractToken(req)
    const session = sessionToken ? authManager.validateSession(sessionToken) : null
    if (!session) {
      sendReject(socket, 401, 'Unauthorized')
      return
    }
  }

  let deviceToken = null
  if (deviceRegistry) {
    const cookie = req.headers['cookie'] || ''
    const tokenMatch = cookie.match(/dsh_token=([a-zA-Z0-9_-]+)/)
      || (req.url && req.url.match(/[?&]token=([a-zA-Z0-9_-]+)/))
    deviceToken = tokenMatch ? tokenMatch[1] : null
    if (deviceToken && deviceRegistry.isRevoked(deviceToken)) {
      sendReject(socket, 401, 'Unauthorized')
      return
    }
    if (deviceToken) deviceRegistry.touch(deviceToken, req)
  }

  socket.setTimeout(0)
  socket.setNoDelay(true)
  socket.setKeepAlive(true, 25000)

  const upgradeHeaders = rewritten(req.headers, authority)
  upgradeHeaders.connection = 'Upgrade'
  upgradeHeaders.upgrade = req.headers.upgrade || 'websocket'

  const upstream = http.request({
    host: '127.0.0.1',
    port: upstreamPort,
    method: req.method,
    path: req.url,
    headers: upgradeHeaders,
  })

  let completed = false
  const earlyClose = () => {
    if (!completed) {
      safeDestroy(upstream)
    }
  }
  socket.once('close', earlyClose)
  socket.on('error', () => { safeDestroy(upstream) })
  upstream.on('error', () => { safeDestroy(socket) })

  upstream.on('upgrade', (answer, upstreamSocket, upstreamHead) => {
    completed = true
    socket.removeListener('close', earlyClose)

    upstreamSocket.setTimeout(0)
    upstreamSocket.setNoDelay(true)
    upstreamSocket.setKeepAlive(true, 25000)

    try {
      const lines = ['HTTP/1.1 101 Switching Protocols']
      for (const [key, value] of Object.entries(answer.headers)) lines.push(key + ': ' + value)
      socket.write(lines.join('\r\n') + '\r\n\r\n')

      if (upstreamHead && upstreamHead.length) socket.write(upstreamHead)
      if (head && head.length) upstreamSocket.write(head)
    } catch (_) {
      safeDestroy(socket)
      safeDestroy(upstreamSocket)
      return
    }

    // Register active sockets for immediate termination on revocation (#54)
    const socketEntry = {
      socket,
      upstreamSocket,
      sessionToken,
      sessionDigest: sessionToken ? digestToken(sessionToken) : null,
      deviceToken,
      deviceHash: deviceToken ? hashToken(deviceToken) : null,
      remote,
    }
    if (activeSocketsRegistry) {
      activeSocketsRegistry.add(socketEntry)
    }

    upstreamSocket.pipe(socket)
    socket.pipe(upstreamSocket)

    const dropDownstream = () => {
      if (activeSocketsRegistry) activeSocketsRegistry.delete(socketEntry)
      safeDestroy(upstreamSocket)
    }
    const dropUpstream = () => {
      if (activeSocketsRegistry) activeSocketsRegistry.delete(socketEntry)
      safeDestroy(socket)
    }
    socket.on('error', dropDownstream)
    socket.on('close', dropDownstream)
    upstreamSocket.on('error', dropUpstream)
    upstreamSocket.on('close', dropUpstream)
  })

  upstream.on('response', (answer) => {
    completed = true
    socket.removeListener('close', earlyClose)

    const lines = ['HTTP/1.1 ' + answer.statusCode + ' ' + (answer.statusMessage || '')]
    let hasConnection = false
    for (const [key, value] of Object.entries(answer.headers)) {
      if (key.toLowerCase() === 'connection') hasConnection = true
      lines.push(key + ': ' + value)
    }
    if (!hasConnection) lines.push('connection: close')
    try {
      socket.write(lines.join('\r\n') + '\r\n\r\n')
      answer.pipe(socket)
    } catch (_) {
      safeDestroy(socket)
    }
  })

  upstream.end()
}
