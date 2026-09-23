// Direct HTTP/HTTPS bridge for remote and LAN access.
//
// Proxies incoming requests from external network interfaces to the local
// harness loopback port, rewrites headers, polyfills Secure Context,
// manages authentication and session lifecycle, and provides telemetry.

import http from 'node:http'
import http2 from 'node:http2'
import https from 'node:https'
import zlib from 'node:zlib'
import os from 'node:os'
import path from 'node:path'

import { parseAllow, allowed, resolveClientRole, isAdministrativeRoute } from './access.js'
import { isPrivileged, challengePin, REFUSED, PIN_REQUIRED } from './privileged.js'
import { shouldHandoff, handoffLocation, tokenFrom } from './handoff.js'
import { forceLoopback, isConnectionBundle } from './loopback-source.js'
import { renderLoginPage } from './login-page.js'
import { generateCachedQRSvg } from './qr.js'
import { readRootCA, generateAppleMobileConfig, isTailscaleAddress } from './tls.js'
import { isCloudflareRequest } from './tunnel.js'
// WebSocket upgrade & TCP keep-alive handled in bridge-ws.js: socket.setKeepAlive(true, 25000), upstreamSocket.setKeepAlive(true, 25000)
import { handleUpgrade } from './bridge-ws.js'
import { safeDestroy, rewritten, throttle, countSockets, relaxTimeouts, filterH2Headers, clientIp, toRules } from './bridge-utils.js'
import { isLocalLanClient, categorizeInterface, getCategorizedInterfaces } from './network-interfaces.js'
export { isLocalLanClient, categorizeInterface, getCategorizedInterfaces }

let reportedCoreSelfSufficiency = false

function noteSelfSufficientCore(log) {
  if (reportedCoreSelfSufficiency) return
  reportedCoreSelfSufficiency = true
  log('Notice: DeepSeek Harness core now operates self-sufficiently; loopback rewrites preserved for compatibility')
}



/**
 * Identify whether a client connects via a standard high-speed local LAN / Wi-Fi subnet.
 * In local gigabit network, dynamic Brotli/Gzip recompression causes CPU overhead
 * without meaningful latency gain.
 * For WAN, Tailscale (100.64.0.0/10), WireGuard or Cloudflare tunnels, compression remains active.
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
  const rules = toRules(options.allow, parseAllow)
  const adminRules = toRules(options.adminAllow, parseAllow)
  const guestRules = toRules(options.guestAllow, parseAllow)
  const tunnelPin = options.tunnelPin ?? true
  const privilegedExtra = options.privilegedExtra || []
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
  const version = options.version || '0.7.17'
  const queueTimeoutMs = options.queueTimeoutMs ?? 15000

  // Connection pooling to upstream harness for standard HTTP (short-lived, static, REST).
  // Upstream Node.js server has 5000ms keepAliveTimeout; prune idle sockets at 3500ms
  // to avoid ECONNRESET races on dead pooled connections (#164).
  const upstreamAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 100,
    maxFreeSockets: 20,
    keepAliveMsecs: 1000,
    timeout: 3500,
  })
  upstreamAgent.on('free', (socket) => {
    socket.setTimeout(3500, () => {
      socket.destroy()
    })
  })

  // Dedicated unpooled agent for long-lived streaming (SSE, event-stream, token stream)
  // Ensures concurrent SSE connections do not starve the HTTP connection pool
  const upstreamStreamAgent = new http.Agent({
    keepAlive: false,
    maxSockets: Infinity,
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
    const isH2 = req.httpVersionMajor >= 2 || Boolean(res.stream)
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

    // Block administrative routes for guests (Fixes #141)
    if (role === 'guest') {
      const url = req.url || ''
      if (isAdministrativeRoute(url)) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'Forbidden: Guest access does not permit administrative actions' }))
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
          const isHtml = accept.includes('text/html') || (req.method === 'GET' && !url.includes('/api/'))
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
        const httpActive = countSockets(upstreamAgent.sockets)
        const httpFree = countSockets(upstreamAgent.freeSockets)
        const httpQueued = countSockets(upstreamAgent.requests)
        const streamActive = countSockets(upstreamStreamAgent.sockets)
        const streamFree = countSockets(upstreamStreamAgent.freeSockets)
        const streamQueued = countSockets(upstreamStreamAgent.requests)

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
            freeSockets: httpFree,
            activeSockets: httpActive,
            queuedRequests: httpQueued,
          },
          httpPool: {
            maxSockets: 100,
            maxFreeSockets: 20,
            activeSockets: httpActive,
            freeSockets: httpFree,
            queuedRequests: httpQueued,
          },
          streamPool: {
            maxSockets: Infinity,
            activeSockets: streamActive,
            freeSockets: streamFree,
            queuedRequests: streamQueued,
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

    const privileged = isPrivileged(req.url, privilegedExtra)
    const isCfTunnel = Boolean(tunnelPin && isCloudflareRequest(req.headers))

    if (lanPin && (isCfTunnel || privileged)) {
      if (privileged && !unlocked) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('dsh-lanmode: ' + REFUSED)
        return
      }
      if (!challengePin(req, res, lanPin)) return
    } else if (privileged && !unlocked) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh-lanmode: ' + REFUSED)
      return
    }

    const patching = isConnectionBundle(req.url)
    const rewrittenHeaders = rewritten(req.headers, authority)
    delete rewrittenHeaders['accept-encoding']

    const acceptHeader = String(req.headers['accept'] || '')
    const isStreamRequest = acceptHeader.includes('text/event-stream')
      || Boolean(req.headers['x-accel-buffering'] === 'no')
      || (req.url && (req.url.includes('/stream') || req.url.includes('/events') || req.url.includes('/sse')))

    const selectedAgent = isStreamRequest ? upstreamStreamAgent : upstreamAgent

    let queued = true
    let queueTimer = null
    if (!isStreamRequest && queueTimeoutMs > 0) {
      queueTimer = setTimeout(() => {
        if (queued) {
          safeDestroy(upstream, new Error('Queue timeout'))
          if (!res.headersSent) {
            res.writeHead(503, {
              'content-type': 'text/plain; charset=utf-8',
              'retry-after': '5',
            })
            res.end('dsh-lanmode: Upstream connection queue timeout -- server pool saturated')
          }
        }
      }, queueTimeoutMs)
      if (queueTimer.unref) queueTimer.unref()
    }

    const upstream = http.request({
      host: '127.0.0.1',
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers: rewrittenHeaders,
      agent: selectedAgent,
    }, (answer) => {
      queued = false
      if (queueTimer) {
        clearTimeout(queueTimer)
        queueTimer = null
      }
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

        const shouldCompress = !alreadyCompressed && !isTooSmall && isCompressible
          && (acceptEncoding.includes('br') || acceptEncoding.includes('gzip'))
          && (!options.adaptiveCompression || !isLocalLanClient(clientIp(req)))

        if (shouldCompress) {
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
            safeDestroy(stream)
            safeDestroy(answer)
          })
          res.writeHead(answer.statusCode || 502, isH2 ? filterH2Headers(outHeaders) : outHeaders)
          answer.pipe(stream).pipe(res)
          return
        }

        res.writeHead(answer.statusCode || 502, isH2 ? filterH2Headers(answer.headers) : answer.headers)
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
        res.writeHead(answer.statusCode || 502, isH2 ? filterH2Headers(out) : out)
        res.end(body)
      })
      answer.on('error', () => { if (!res.writableEnded) res.end() })
    })

    upstream.on('socket', () => {
      queued = false
      if (queueTimer) {
        clearTimeout(queueTimer)
        queueTimer = null
      }
    })

    upstream.on('error', (err) => {
      if (queueTimer) {
        clearTimeout(queueTimer)
        queueTimer = null
      }
      const code = err?.code || 'UNKNOWN'
      const msg = err?.message || String(err)
      log(`[bridge] upstream error (${code}): ${msg} on ${req.method} ${req.url}`)
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`dsh-lanmode: Harness backend is not responding (${code}: ${msg})`)
    })
    res.on('close', () => {
      if (queueTimer) {
        clearTimeout(queueTimer)
        queueTimer = null
      }
      if (!res.writableEnded) {
        safeDestroy(upstream)
      }
    })
    req.on('error', () => { safeDestroy(upstream) })
    req.pipe(upstream)
  }

  const upgrade = (req, socket, head) => {
    handleUpgrade(req, socket, head, {
      welcome,
      isPasswordAuth,
      authManager,
      deviceRegistry,
      rewritten,
      authority,
      upstreamPort,
      safeDestroy,
    })
  }

  const servers = []
  for (const host of hosts) {
    const server = options.tls
      ? http2.createSecureServer({ cert: options.tls.cert, key: options.tls.key, allowHTTP1: true }, handle)
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
    safeDestroy(upstreamAgent)
    safeDestroy(upstreamStreamAgent)
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
