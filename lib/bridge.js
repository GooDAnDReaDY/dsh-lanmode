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

import { parseAllow, allowed, resolveClientRole, isAdministrativeRoute, verifyAdminAccess } from './access.js'
import { handleBridgeLocalRoutes } from './bridge-local.js'
import { isPrivileged, challengePin, REFUSED, PIN_REQUIRED } from './privileged.js'
import { shouldHandoff, handoffLocation, tokenFrom } from './handoff.js'
import { forceLoopback, isConnectionBundle } from './loopback-source.js'
import { isCloudflareRequest } from './tunnel.js'
// WebSocket upgrade & TCP keep-alive handled in bridge-ws.js: socket.setKeepAlive(true, 25000), upstreamSocket.setKeepAlive(true, 25000)
import { handleUpgrade } from './bridge-ws.js'
import { safeDestroy, rewritten, throttle, relaxTimeouts, filterH2Headers, clientIp, toRules } from './bridge-utils.js'
import { mergeDshAuthCookie } from './dsh-auth-cookie.js'
import { gateWrap } from './gate.js'
import { rejectBanned } from './bans.js'
import { discoverLoopbackPort, explicitUpstreamPort } from './upstream-port.js'
import { tlsServerOptions } from './sni.js'
import { isLocalLanClient, categorizeInterface, getCategorizedInterfaces } from './network-interfaces.js'
export { isLocalLanClient, categorizeInterface, getCategorizedInterfaces }


function denyUnlessAdmin(req, res, authManager, passwordOn, remote, role) {
  const auth = verifyAdminAccess(req, {
    state: { authManager, passwordAuth: passwordOn },
    config: { passwordAuth: passwordOn },
    clientIp: remote,
    role,
  })
  if (!auth.ok) {
    res.writeHead(auth.status || 403, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: auth.error }))
    return false
  }
  return true
}

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
function purgeFreeSockets(agent) {
  if (!agent?.freeSockets) return
  for (const key of Object.keys(agent.freeSockets)) {
    const list = agent.freeSockets[key] || []
    while (list.length) {
      const s = list.shift()
      if (s._lanmodeIdleTimer) {
        clearTimeout(s._lanmodeIdleTimer)
        s._lanmodeIdleTimer = null
      }
      safeDestroy(s)
    }
  }
}

function listenAfterPortDiscovery(context, options) {
  const log = typeof options.log === 'function' ? options.log : () => {}
  let cancelled = false
  let stop = () => {}
  const probe = typeof options.probeUpstreamPort === 'function' ? options.probeUpstreamPort : discoverLoopbackPort
  Promise.resolve()
    .then(() => probe())
    .then((port) => {
      const found = Number(port)
      if (cancelled || !Number.isInteger(found) || found <= 0) {
        if (!cancelled) log('Direct bridge not started: web server port unknown')
        return
      }
      const webServer = Object.assign({}, context && context.webServer, { port: found })
      stop = startDirectBridge(Object.assign({}, context, { webServer }), options)
    })
    .catch((err) => {
      if (!cancelled) log('Direct bridge discovery failed: ' + String(err && err.message || err))
    })
  return () => {
    cancelled = true
    stop()
  }
}

export function startDirectBridge(context, options = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {}
  const upstreamPort = explicitUpstreamPort(context?.webServer)
  if (!upstreamPort) {
    log('Direct bridge port unknown, probing loopback')
    return listenAfterPortDiscovery(context, options)
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
  })
  upstreamAgent.on('free', (socket) => {
    if (socket._lanmodeIdleTimer) clearTimeout(socket._lanmodeIdleTimer)
    socket._lanmodeIdleTimer = setTimeout(() => {
      safeDestroy(socket)
    }, 4000)
    socket._lanmodeIdleTimer.unref?.()
    if (!socket._lanmodeCloseBound) {
      socket._lanmodeCloseBound = true
      socket.once('close', () => {
        if (socket._lanmodeIdleTimer) {
          clearTimeout(socket._lanmodeIdleTimer)
          socket._lanmodeIdleTimer = null
        }
      })
    }
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
    const remote = clientIp(req, options.trustedProxyCidrs)
    if (rejectBanned(res, options.banList, remote)) return
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
    res.write = gateWrap(res.write, (origWrite) => function (chunk, ...args) {
      if (chunk) totalBytesSent += chunk.length
      return origWrite.call(this, chunk, ...args)
    })
    res.end = gateWrap(res.end, (origEnd) => function (chunk, ...args) {
      if (chunk) totalBytesSent += chunk.length
      return origEnd.call(this, chunk, ...args)
    })

    if (handleBridgeLocalRoutes(req, res, {
      options,
      authManager,
      isPasswordAuth,
      version,
      hosts,
      upstreamAgent,
      upstreamStreamAgent,
      activeConnections,
      totalBytesSent,
      totalBytesReceived,
      deviceRegistry,
      remote,
      role,
      currentToken,
      denyUnlessAdmin,
    })) return



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
    const cachedAuth = typeof options.dshAuthCookie === 'function' ? options.dshAuthCookie() : ''
    if (cachedAuth) {
      rewrittenHeaders.cookie = mergeDshAuthCookie(rewrittenHeaders.cookie, cachedAuth)
    }
    delete rewrittenHeaders['accept-encoding']

    const acceptHeader = String(req.headers['accept'] || '')
    const isStreamRequest = acceptHeader.includes('text/event-stream')
      || Boolean(req.headers['x-accel-buffering'] === 'no')
      || (req.url && (req.url.includes('/stream') || req.url.includes('/events') || req.url.includes('/sse')))

    const selectedAgent = isStreamRequest ? upstreamStreamAgent : upstreamAgent

    const hasBody = Boolean(req.headers['content-length'] || req.headers['transfer-encoding'])
    const isIdempotent = req.method === 'GET' || req.method === 'HEAD'

    let clientClosed = false
    let currentUpstream = null
    let currentAnswer = null
    let currentStream = null
    let queueTimer = null

    const cleanupClient = () => {
      clientClosed = true
      if (queueTimer) {
        clearTimeout(queueTimer)
        queueTimer = null
      }
      if (currentStream) safeDestroy(currentStream)
      if (currentAnswer) safeDestroy(currentAnswer)
      if (currentUpstream && !res.writableEnded) safeDestroy(currentUpstream)
    }

    res.once('close', cleanupClient)
    req.once('error', () => {
      if (currentUpstream) safeDestroy(currentUpstream)
    })

    function dispatch(attempt) {
      if (clientClosed || res.destroyed) return

      let queued = true
      if (!isStreamRequest && queueTimeoutMs > 0 && attempt === 0) {
        queueTimer = setTimeout(() => {
          if (queued) {
            safeDestroy(currentUpstream, new Error('Queue timeout'))
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
        currentAnswer = answer
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
            && (!options.adaptiveCompression || !isLocalLanClient(clientIp(req, options.trustedProxyCidrs)))

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
            currentStream = stream
            stream.on('error', () => { if (!res.writableEnded) res.end() })
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

      currentUpstream = upstream

      upstream.on('socket', (sock) => {
        queued = false
        if (sock._lanmodeIdleTimer) {
          clearTimeout(sock._lanmodeIdleTimer)
          sock._lanmodeIdleTimer = null
        }
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
        if (clientClosed || res.destroyed) return

        const code = err?.code || 'UNKNOWN'
        const msg = err?.message || String(err)
        const isResetError = code === 'ECONNRESET' || code === 'EPIPE' || msg.includes('socket hang up')
        const isReused = Boolean(upstream.reusedSocket)

        // Idempotent retry: safe single retry for GET/HEAD without body when socket is reset or was reused (#164)
        if (isIdempotent && !hasBody && attempt === 0 && !res.headersSent && (isReused || isResetError)) {
          safeDestroy(upstream)
          purgeFreeSockets(upstreamAgent)
          log(`[bridge] upstream reset on ${isReused ? 'reused' : 'initial'} socket (${code}: ${msg}), retrying ${req.method} ${req.url} (attempt 2)...`)
          dispatch(attempt + 1)
          return
        }

        log(`[bridge] upstream error (${code}): ${msg} on ${req.method} ${req.url}`)
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(`dsh-lanmode: Harness backend is not responding (${code}: ${msg})`)
      })

      if (hasBody) {
        req.pipe(upstream)
      } else {
        req.resume()
        upstream.end()
      }
    }

    dispatch(0)
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
      ? http2.createSecureServer(tlsServerOptions(options.tls), handle)
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
    purgeFreeSockets(upstreamAgent)
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
