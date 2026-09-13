// Direct HTTP/HTTPS bridge for remote and LAN access.
//
// Proxies incoming requests from external network interfaces to the local
// harness loopback port, rewrites headers, polyfills Secure Context,
// manages authentication and session lifecycle, and provides telemetry.

import http from 'node:http'
import https from 'node:https'
import zlib from 'node:zlib'
import os from 'node:os'
import path from 'node:path'

import { parseAllow, allowed, resolveClientRole } from './access.js'
import { isPrivileged, REFUSED, PIN_REQUIRED } from './privileged.js'
import { shouldHandoff, handoffLocation, tokenFrom } from './handoff.js'
import { forceLoopback } from './loopback-source.js'
import { renderLoginPage } from './login-page.js'
import { generateCachedQRSvg } from './qr.js'
import { readRootCA, generateAppleMobileConfig, isTailscaleAddress } from './tls.js'

let reportedCoreSelfSufficiency = false

function noteSelfSufficientCore(log) {
  if (reportedCoreSelfSufficiency) return
  reportedCoreSelfSufficiency = true
  log('Notice: DeepSeek Harness core now operates self-sufficiently; loopback rewrites preserved for compatibility')
}

function clientIp(req) {
  return (req.socket && req.socket.remoteAddress) || ''
}

function isLoopbackIp(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

function rewritten(headers, authority) {
  const out = { ...headers, host: authority }
  if (out.origin) out.origin = 'http://' + authority
  if (out.referer) out.referer = String(out.referer).replace(/^https?:\/\/[^/]+/, 'http://' + authority)
  delete out.connection
  delete out.upgrade
  return out
}

function throttle(log, everyMs) {
  let last = 0
  let skipped = 0
  return (message) => {
    const now = Date.now()
    if (now - last < everyMs) {
      skipped++
      return
    }
    const suffix = skipped ? ` (${skipped} similar events throttled)` : ''
    skipped = 0
    last = now
    log?.(message + suffix)
  }
}

function relaxTimeouts(server, streamTimeoutMs) {
  server.requestTimeout = 0
  server.headersTimeout = 60000
  server.keepAliveTimeout = 65000
  server.timeout = streamTimeoutMs
}

export function categorizeInterface(ifaceName, addr) {
  if (addr === '127.0.0.1' || addr === '::1' || ifaceName === 'lo') return 'loopback'
  if (isTailscaleAddress(addr) || ifaceName.includes('tailscale') || ifaceName.includes('ts')) return 'tailscale'
  if (ifaceName.includes('wg')) return 'wireguard'
  if (ifaceName.includes('tun')) return 'vpn'
  return 'lan'
}

/** Collect and categorize network interfaces. */
export function getCategorizedInterfaces(hosts = []) {
  const result = []
  const seen = new Set()

  const addIfNew = (addr, type, label) => {
    if (!addr || seen.has(addr)) return
    seen.add(addr)
    result.push({ address: addr, type, label })
  }

  // Check mDNS
  addIfNew('dsh.local', 'mdns', 'mDNS (dsh.local)')

  const ifaces = os.networkInterfaces()
  for (const [ifaceName, list] of Object.entries(ifaces)) {
    for (const item of list || []) {
      if (!item || item.internal) continue
      const addr = item.address
      if (item.family === 'IPv4') {
        if (isTailscaleAddress(addr) || ifaceName.includes('tailscale') || ifaceName.includes('ts')) {
          addIfNew(addr, 'tailscale', `Tailscale (${addr})`)
        } else if (ifaceName.includes('wg') || ifaceName.includes('tun')) {
          addIfNew(addr, 'vpn', `WireGuard/VPN (${addr})`)
        } else {
          addIfNew(addr, 'lan', `Local LAN (${addr})`)
        }
      }
    }
  }

  for (const host of hosts) {
    if (!seen.has(host) && !host.startsWith('127.') && host !== '::1') {
      addIfNew(host, 'other', host)
    }
  }

  return result
}

/**
 * Start direct HTTP/HTTPS reverse proxy bridge.
 */
export function startDirectBridge(context, options = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {}
  const upstreamPort = context.webServer?.port || (typeof context.webServer?.address === 'function' ? context.webServer.address()?.port : null)
  if (!upstreamPort) {
    log('Direct bridge not started: web server port unknown')
    return () => {}
  }
  const authority = '127.0.0.1:' + upstreamPort
  const hosts = options.hosts || ['127.0.0.1']
  const toRules = (input) => {
    if (!input) return []
    if (Array.isArray(input)) {
      if (input.length === 0) return []
      if (typeof input[0] === 'string') return parseAllow(input).rules
      return input
    }
    if (Array.isArray(input.rules)) return input.rules
    return []
  }
  const rules = toRules(options.allow)
  const adminRules = toRules(options.adminAllow)
  const guestRules = toRules(options.guestAllow)
  const unlocked = options.unlockPrivileged ?? false
  const lanPin = options.lanPin ?? null
  const authManager = options.authManager ?? null
  const deviceRegistry = options.deviceRegistry ?? null
  const isPasswordAuth = () => options.passwordAuth ?? false
  const currentToken = () => {
    if (typeof options.token === 'function') return options.token()
    if (options.token) return options.token
    if (options.autoAuth === false) return ''
    try {
      const connection = context.get?.('connection')
      if (connection === undefined) return ''
      return tokenFrom(connection.authenticatedUrl('http://' + authority))
    } catch (_) {
      return ''
    }
  }
  const streamTimeoutMs = options.streamTimeoutMs ?? 0
  const version = options.version || '0.7.14'

  // Connection pooling to upstream harness
  const upstreamAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 100,
    maxFreeSockets: 20,
    keepAliveMsecs: 30000,
  })

  // Telemetry metrics
  let activeConnections = 0
  let totalBytesSent = 0
  let totalBytesReceived = 0

  const refuse = throttle(options.log, 10000)
  const welcome = (address) => {
    if (allowed(address, rules)) return true
    refuse('access denied: address ' + String(address) + ' not in allowlist')
    return false
  }

  const handle = (req, res) => {
    const remote = clientIp(req)
    if (!welcome(remote)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh-lanmode: access denied by allowlist rule')
      return
    }

    // Role check (Admin vs Guest)
    const role = resolveClientRole(remote, {
      adminRules,
      guestRules,
      defaultRules: rules,
    })

    if (role === 'denied') {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh-lanmode: access denied by subnet rule')
      return
    }

    // Block administrative routes for guests
    if (role === 'guest') {
      const url = req.url || ''
      if (
        url.startsWith('/api/settings') ||
        url.startsWith('/api/plugins') ||
        url.startsWith('/dsh-lanmode/api/devices/revoke')
      ) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'Forbidden: Guest access does not permit settings modification' }))
        return
      }
    }

    // Track received bytes
    req.on('data', (chunk) => {
      totalBytesReceived += chunk.length
    })

    // Track sent bytes
    const origWrite = res.write
    const origEnd = res.end
    res.write = function (chunk, ...args) {
      if (chunk) totalBytesSent += chunk.length
      return origWrite.call(this, chunk, ...args)
    }
    res.end = function (chunk, ...args) {
      if (chunk) totalBytesSent += chunk.length
      return origEnd.call(this, chunk, ...args)
    }

    // Static / utility endpoints
    if (req.url) {
      const pathname = req.url.split('?')[0]

      // Apple Configuration Profile (.mobileconfig)
      if (pathname === '/dsh-lanmode/ca.mobileconfig') {
        const caPem = (options.tls && options.tls.caCert) || readRootCA(path.join(os.homedir(), '.dsh'))
        if (!caPem) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('dsh-lanmode: Root CA certificate not available')
          return
        }
        const mobileConfig = generateAppleMobileConfig(caPem)
        res.writeHead(200, {
          'content-type': 'application/x-apple-aspen-config',
          'content-disposition': 'attachment; filename="dsh-ca.mobileconfig"',
          'cache-control': 'public, max-age=3600',
        })
        res.end(mobileConfig)
        return
      }

      // Categorized Interfaces API
      if (pathname === '/dsh-lanmode/api/interfaces') {
        const ifaces = getCategorizedInterfaces(hosts)
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-cache',
        })
        res.end(JSON.stringify(ifaces))
        return
      }

      // Telemetry API
      if (pathname === '/dsh-lanmode/api/telemetry') {
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-cache',
        })
        res.end(JSON.stringify({
          uptime: process.uptime(),
          activeConnections,
          totalBytesSent,
          totalBytesReceived,
          keepAlivePool: {
            maxSockets: 100,
            maxFreeSockets: 20,
            freeSockets: Object.keys(upstreamAgent.freeSockets || {}).length,
            activeSockets: Object.keys(upstreamAgent.sockets || {}).length,
          },
        }))
        return
      }

      // Devices API: List
      if (pathname === '/dsh-lanmode/api/devices' && req.method === 'GET') {
        const list = deviceRegistry ? deviceRegistry.list() : []
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-cache',
        })
        res.end(JSON.stringify(list))
        return
      }

      // Devices API: Revoke
      if (pathname === '/dsh-lanmode/api/devices/revoke' && req.method === 'POST') {
        let body = ''
        req.on('data', (d) => { body += d })
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            if (data.deviceId && deviceRegistry) {
              deviceRegistry.revoke(data.deviceId)
              if (authManager) authManager.revokeSession(data.deviceId)
            }
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ ok: true }))
          } catch (_) {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'Invalid request body' }))
          }
        })
        return
      }

      // Devices API: Revoke Others
      if (pathname === '/dsh-lanmode/api/devices/revoke-others' && req.method === 'POST') {
        let body = ''
        req.on('data', (d) => { body += d })
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}')
            if (deviceRegistry) {
              deviceRegistry.revokeAllExcept(data.currentId)
            }
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ ok: true }))
          } catch (_) {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'Invalid request body' }))
          }
        })
        return
      }

      // Vector QR Code with caching & ETag
      if (pathname === '/dsh-lanmode/qr') {
        const queryIdx = req.url.indexOf('?')
        const params = new URLSearchParams(queryIdx !== -1 ? req.url.slice(queryIdx) : '')
        let targetText = params.get('url')
        if (!targetText) {
          const scheme = options.tls ? 'https' : 'http'
          const host = (req.headers.host || `${hosts[0]}:${options.port}`).split(':')[0]
          const token = currentToken()
          targetText = `${scheme}://${host}:${options.port}/${token ? '?token=' + token : ''}`
        }

        const cached = generateCachedQRSvg(targetText, {
          size: parseInt(params.get('size'), 10) || 240,
          margin: parseInt(params.get('margin'), 10) || 1,
        })

        const ifNoneMatch = req.headers['if-none-match']
        if (ifNoneMatch && ifNoneMatch === cached.etag) {
          res.writeHead(304, {
            'ETag': cached.etag,
            'Cache-Control': 'public, max-age=3600',
            'Vary': 'Accept-Encoding',
          })
          res.end()
          return
        }

        res.writeHead(200, {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(cached.svg),
          'ETag': cached.etag,
          'Cache-Control': 'public, max-age=3600',
          'Vary': 'Accept-Encoding',
        })
        res.end(cached.svg)
        return
      }
    }

    // #103: Password authentication
    if (isPasswordAuth() && authManager) {
      const url = req.url || ''
      const isPublic = url.startsWith('/dsh-lanmode/auth/')
        || url.startsWith('/dsh-lanmode/ca.crt')
        || url.startsWith('/dsh-lanmode/ca.mobileconfig')
        || url.startsWith('/dsh-lanmode/manifest.json')
        || url.startsWith('/favicon.ico')
        || url.startsWith('/dsh-lanmode/qr')

      if (!isPublic) {
        const token = authManager.extractToken(req)
        const session = token ? authManager.validateSession(token) : null
        if (!session) {
          const accept = req.headers['accept'] || ''
          const isHtml = accept.includes('text/html') || (req.method === 'GET' && !url.startsWith('/api/'))
          if (isHtml) {
            const html = renderLoginPage({
              https: Boolean(options.tls),
              defaultUser: options.authUser || 'admin',
              version,
            })
            res.writeHead(200, {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
            })
            res.end(html)
            return
          } else {
            res.writeHead(401, {
              'content-type': 'application/json; charset=utf-8',
              'x-dsh-auth-required': '1',
            })
            res.end(JSON.stringify({ error: 'Authentication required', authRequired: true }))
            return
          }
        }
      }
    }

    // Device tracking and revocation check
    if (deviceRegistry) {
      const cookie = req.headers['cookie'] || ''
      const tokenMatch = cookie.match(/dsh_token=([a-zA-Z0-9_-]+)/)
        || (req.url && req.url.match(/[?&]token=([a-zA-Z0-9_-]+)/))
      const token = tokenMatch ? tokenMatch[1] : null
      if (token && deviceRegistry.isRevoked(token)) {
        res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('dsh-lanmode: device session revoked')
        return
      }
      if (token) deviceRegistry.touch(token, req)
    }

    if (!unlocked && isPrivileged(req.url, req.method)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh-lanmode: ' + REFUSED)
      return
    }

    const patching = req.url && req.url.startsWith('/plugins/@deepseek-ai/dsh-client-connection/')
    const rewrittenHeaders = rewritten(req.headers, authority)
    delete rewrittenHeaders['accept-encoding']

    const upstream = http.request({
      host: '127.0.0.1',
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers: rewrittenHeaders,
      agent: upstreamAgent,
    }, (answer) => {
      if (shouldHandoff({ method: req.method, url: req.url, status: answer.statusCode, token: currentToken() })) {
        answer.resume()
        res.writeHead(303, {
          'cache-control': 'no-store',
          'location': handoffLocation(req.url, currentToken()),
          'referrer-policy': 'no-referrer',
        })
        res.end()
        return
      }

      if (!patching) {
        const acceptEncoding = req.headers['accept-encoding'] || ''
        const contentType = String(answer.headers['content-type'] || '')
        const acceptHeader = String(req.headers['accept'] || '')
        const isSse = contentType.includes('text/event-stream')
          || acceptHeader.includes('text/event-stream')
          || answer.headers['x-accel-buffering'] === 'no'
        const isCompressible = !isSse && /json|text|javascript|xml|html/i.test(contentType)
        const alreadyCompressed = Boolean(answer.headers['content-encoding'])
        const contentLength = Number(answer.headers['content-length'] || 0)
        const isTooSmall = contentLength > 0 && contentLength < 1024

        if (!alreadyCompressed && !isTooSmall && isCompressible && (acceptEncoding.includes('br') || acceptEncoding.includes('gzip'))) {
          const outHeaders = { ...answer.headers }
          delete outHeaders['content-length']
          let stream
          if (acceptEncoding.includes('br') && zlib.createBrotliCompress) {
            outHeaders['content-encoding'] = 'br'
            stream = zlib.createBrotliCompress({
              params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
            })
          } else {
            outHeaders['content-encoding'] = 'gzip'
            stream = zlib.createGzip({ level: 6 })
          }
          stream.on('error', () => { if (!res.writableEnded) res.end() })
          res.on('close', () => {
            try { stream.destroy() } catch (_) {}
            try { answer.destroy() } catch (_) {}
          })
          res.writeHead(answer.statusCode || 502, outHeaders)
          answer.pipe(stream).pipe(res)
          return
        }

        res.writeHead(answer.statusCode || 502, answer.headers)
        answer.pipe(res)
        return
      }

      const parts = []
      answer.on('data', (chunk) => parts.push(chunk))
      answer.on('end', () => {
        const done = forceLoopback(Buffer.concat(parts).toString('utf8'))
        if (!done.changed) noteSelfSufficientCore(options.log)
        const body = Buffer.from(done.source, 'utf8')
        const out = { ...answer.headers }
        out['content-length'] = String(body.length)
        delete out['content-encoding']
        res.writeHead(answer.statusCode || 502, out)
        res.end(body)
      })
      answer.on('error', () => { if (!res.writableEnded) res.end() })
    })

    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh-lanmode: Harness backend is not responding')
    })
    req.on('error', () => { try { upstream.destroy() } catch (_) {} })
    req.pipe(upstream)
  }

  const upgrade = (req, socket, head) => {
    if (!welcome(socket.remoteAddress)) {
      try {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        socket.destroy()
      } catch (_) {}
      return
    }

    if (isPasswordAuth() && authManager) {
      const token = authManager.extractToken(req)
      const session = token ? authManager.validateSession(token) : null
      if (!session) {
        try {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
          socket.destroy()
        } catch (_) {}
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
          socket.destroy()
        } catch (_) {}
        return
      }
      if (token) deviceRegistry.touch(token, req)
    }

    socket.setTimeout(0)
    socket.setNoDelay(true)
    socket.setKeepAlive(true, 25000)

    const upstream = http.request({
      host: '127.0.0.1',
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers: rewritten(req.headers, authority),
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

      const dropDownstream = () => { try { upstreamSocket.destroy() } catch (_) {} }
      const dropUpstream = () => { try { socket.destroy() } catch (_) {} }
      socket.on('error', dropDownstream)
      socket.on('close', dropDownstream)
      upstreamSocket.on('error', dropUpstream)
      upstreamSocket.on('close', dropUpstream)
    })

    upstream.on('response', (answer) => {
      const lines = ['HTTP/1.1 ' + answer.statusCode + ' ' + (answer.statusMessage || '')]
      for (const [key, value] of Object.entries(answer.headers)) lines.push(key + ': ' + value)
      lines.push('connection: close')
      try {
        socket.write(lines.join('\r\n') + '\r\n\r\n')
        answer.pipe(socket)
      } catch (_) {
        try { socket.destroy() } catch (_) {}
      }
    })

    upstream.on('error', () => { try { socket.destroy() } catch (_) {} })
    socket.on('error', () => { try { upstream.destroy() } catch (_) {} })
    upstream.end()
  }

  const servers = []
  for (const host of hosts) {
    const server = options.tls
      ? https.createServer({ cert: options.tls.cert, key: options.tls.key }, handle)
      : http.createServer(handle)
    server.on('upgrade', upgrade)
    relaxTimeouts(server, streamTimeoutMs)

    server.on('connection', (socket) => {
      activeConnections++
      socket.on('close', () => {
        activeConnections = Math.max(0, activeConnections - 1)
      })
    })

    server.on('error', (failure) => {
      const code = failure && failure.code
      if (code === 'EADDRINUSE') {
        log('Port ' + options.port + ' on ' + host + ' is already in use')
      } else if (code === 'EADDRNOTAVAIL') {
        log('Address ' + host + ' is not available on this host — skipping')
      } else {
        log('Direct listener error on ' + host + ': ' + String(failure && failure.message || failure))
      }
    })

    server.listen(options.port, host, () => {
      log('listening on ' + (options.tls ? 'https://' : 'http://') + host + ':' + options.port
        + ', forwarding to ' + authority
        + (rules.length ? ', allow rules: ' + rules.length : ', allow all')
        + (unlocked ? (lanPin ? ', PIN required' : '') : ', privileged calls locked'))
    })
    servers.push(server)
  }

  return async () => {
    try { upstreamAgent.destroy() } catch (_) {}
    const closers = servers.map((server) => new Promise((resolve) => {
      try {
        server.close(() => resolve())
      } catch (_) {
        resolve()
      }
    }))
    await Promise.all(closers)
  }
}
