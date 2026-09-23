// WebSocket and connection upgrade handler for Direct Bridge.
// Proxies WebSocket connections to upstream harness loopback port,
// validates authentication, session tokens and manages duplex stream lifecycles.
// Zero hardcoded Cyrillic characters.

import http from 'node:http'

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
  } = options

  if (!welcome(socket.remoteAddress)) {
    try {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    } catch (err) { /* bestEffort */ void err }
    safeDestroy(socket)
    return
  }

  if (isPasswordAuth() && authManager) {
    const token = authManager.extractToken(req)
    const session = token ? authManager.validateSession(token) : null
    if (!session) {
      try {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      } catch (err) { /* bestEffort */ void err }
      safeDestroy(socket)
      return
    }
  }

  if (deviceRegistry) {
    const cookie = req.headers['cookie'] || ''
    const tokenMatch = cookie.match(/dsh_token=([a-zA-Z0-9_-]+)/)
      || (req.url && req.url.match(/[?&]token=([a-zA-Z0-9_-]+)/))
    const token = tokenMatch ? tokenMatch[1] : null
    if (token && deviceRegistry.isRevoked(token)) {
      try {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      } catch (err) { /* bestEffort */ void err }
      safeDestroy(socket)
      return
    }
    if (token) deviceRegistry.touch(token, req)
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

  upstream.on('upgrade', (answer, upstreamSocket, upstreamHead) => {
    upstreamSocket.setTimeout(0)
    upstreamSocket.setNoDelay(true)
    upstreamSocket.setKeepAlive(true, 25000)
    const lines = ['HTTP/1.1 101 Switching Protocols']
    for (const [key, value] of Object.entries(answer.headers)) lines.push(key + ': ' + value)
    socket.write(lines.join('\r\n') + '\r\n\r\n')

    if (upstreamHead && upstreamHead.length) socket.write(upstreamHead)
    if (head && head.length) upstreamSocket.write(head)

    upstreamSocket.pipe(socket)
    socket.pipe(upstreamSocket)

    const dropDownstream = () => { safeDestroy(upstreamSocket) }
    const dropUpstream = () => { safeDestroy(socket) }
    socket.on('error', dropDownstream)
    socket.on('close', dropDownstream)
    upstreamSocket.on('error', dropUpstream)
    upstreamSocket.on('close', dropUpstream)
  })

  upstream.on('response', (answer) => {
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

  upstream.on('error', () => { safeDestroy(socket) })
  socket.on('error', () => { safeDestroy(upstream) })
  upstream.end()
}
