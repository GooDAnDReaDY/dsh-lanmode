// Direct HTTP/HTTPS bridge for remote and LAN access.

import http from 'node:http'
import http2 from 'node:http2'
import https from 'node:https'
import zlib from 'node:zlib'
import os from 'node:os'
import path from 'node:path'

import { parseAllow, allowed, resolveClientRole, isAdministrativeRoute, verifyAdminAccess, isLoopbackAddress } from './access.js'
import { handleBridgeLocalRoutes } from './bridge-local.js'
import { isPrivileged, challengePin, verifyLanPin, REFUSED, PIN_REQUIRED } from './privileged.js'
import { resolveSecret } from './secret.js'
import { shouldHandoff, handoffLocation, tokenFrom } from './handoff.js'
import { forceLoopback, isConnectionBundle } from './loopback-source.js'
import { isCloudflareRequest } from './tunnel.js'
// WebSocket upgrade & TCP keep-alive handled in bridge-ws.js: socket.setKeepAlive(true, 25000), upstreamSocket.setKeepAlive(true, 25000)
import { handleUpgrade } from './bridge-ws.js'
import { createActiveSocketsRegistry } from './bridge-sockets.js'
import { safeDestroy, rewritten, throttle, relaxTimeouts, filterH2Headers, clientIp, toRules, verifyBridgeOrigin, purgeFreeSockets, listenAfterPortDiscovery } from './bridge-utils.js'
import { mergeDshAuthCookie, pickDshAuthCookie, hasCoreAuthCookie, mintDshAuthCookie } from './dsh-auth-cookie.js'
import { gateWrap } from './gate.js'
import { rejectBanned } from './bans.js'
import { hashToken } from './devices.js'
import { discoverLoopbackPort, explicitUpstreamPort, resolveUpstreamPort } from './upstream-port.js'
import { tlsServerOptions } from './sni.js'
import { isLocalLanClient, categorizeInterface, getCategorizedInterfaces } from './network-interfaces.js'
export { isLocalLanClient, categorizeInterface, getCategorizedInterfaces }

function denyUnlessAdmin(req, res, authManager, passwordOn, remote, role, bridgeOptions = {}) {
  const auth = verifyAdminAccess(req, {
    state: { authManager, passwordAuth: passwordOn, lanPinValue: bridgeOptions.lanPinValue, lanPin: bridgeOptions.lanPin },
    config: { passwordAuth: passwordOn, lanPin: bridgeOptions.lanPin },
    clientIp: remote,
    role,
  })
  if (!auth.ok) {
    res.writeHead(auth.status || 403, { 'content-type': 'application/json; charset=utf-8', ...(auth.headers || {}) })
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
// Bypass recompression on high-speed local subnets
export function startDirectBridge(context, options = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {}
  const upstreamPort = explicitUpstreamPort(context?.webServer)
  if (!upstreamPort) {
    log('Direct bridge port unknown, probing loopback')
    return listenAfterPortDiscovery(context, options, startDirectBridge)
  }
  const authority = '127.0.0.1:' + upstreamPort
  const hosts = options.hosts || ['127.0.0.1']
  const getRules = () => (options.state?.rules ? options.state.rules : toRules(options.allow, parseAllow))
  const getAdminRules = () => (options.state?.adminRules ? options.state.adminRules : toRules(options.adminAllow, parseAllow))
  const getGuestRules = () => (options.state?.guestRules ? options.state.guestRules : toRules(options.guestAllow, parseAllow))
  const getTrustedProxyCidrs = () => (options.state?.trustedProxyCidrs || options.trustedProxyCidrs || ['127.0.0.0/8', '::1/128'])
  const getTunnelPin = () => options.state?.tunnelPin !== undefined ? Boolean(options.state.tunnelPin) : (typeof options.tunnelPin === 'function' ? Boolean(options.tunnelPin()) : options.tunnelPin !== false)
  const getPrivilegedExtra = () => Array.isArray(options.state?.privilegedExtra) ? options.state.privilegedExtra : (typeof options.privilegedExtra === 'function' ? options.privilegedExtra() || [] : options.privilegedExtra || [])
  const getUnlocked = () => (options.state?.unlockPrivileged !== undefined && options.state?.unlockPrivileged !== null) ? Boolean(options.state.unlockPrivileged) : (typeof options.unlockPrivileged === 'function' ? Boolean(options.unlockPrivileged()) : options.unlockPrivileged !== false)
  const getAllowUnprivilegedLan = () => Boolean(options.state?.allowUnprivilegedLan !== undefined ? options.state.allowUnprivilegedLan : (typeof options.allowUnprivilegedLan === 'function' ? options.allowUnprivilegedLan() : options.allowUnprivilegedLan))
  const getLanPin = () => (options.state?.lanPinValue !== undefined) ? options.state.lanPinValue || null : (typeof options.lanPin === 'function' ? options.lanPin() ?? null : options.lanPin ?? null)
  const resolveActivePin = async () => {
    const configuredPinRef = options.config?.lanPinRef || options.state?.config?.lanPinRef || options.state?.lanPinRef || options.lanPinRef || null
    const fallbackPin = options.config?.lanPin || options.state?.config?.lanPin || (typeof options.lanPin === 'string' ? options.lanPin : '') || ''
    if (configuredPinRef) {
      try {
        const res = await resolveSecret(context, configuredPinRef, fallbackPin)
        const resolved = res ? String(res).trim() : (fallbackPin ? String(fallbackPin).trim() : null)
        if (options.state) { options.state.lanPinValue = resolved; options.state.lanPin = Boolean(resolved || configuredPinRef) }
        return { pin: resolved, configuredRef: configuredPinRef }
      } catch (_) {
        const resolved = fallbackPin ? String(fallbackPin).trim() : null
        if (options.state) { options.state.lanPinValue = resolved; options.state.lanPin = Boolean(resolved || configuredPinRef) }
        return { pin: resolved, configuredRef: configuredPinRef }
      }
    }
    const staticPin = options.state?.lanPinValue !== undefined ? options.state.lanPinValue : (typeof options.lanPin === 'function' ? options.lanPin() : options.lanPin)
    return { pin: staticPin ? String(staticPin).trim() : null, configuredRef: null }
  }
  const authManager = options.authManager ?? null
  const deviceRegistry = options.deviceRegistry ?? null
  let cachedCoreAuthCookie = ''
  const getBrowserAuthSecret = () => options.browserAuthSecret || options.state?.browserAuthSecret || ''
  const resolveCoreAuthCookie = () => {
    if (typeof options.dshAuthCookie === 'function') {
      const c = options.dshAuthCookie()
      if (c) return c
    } else if (options.dshAuthCookie) {
      return String(options.dshAuthCookie)
    }
    if (cachedCoreAuthCookie) return cachedCoreAuthCookie
    const secret = getBrowserAuthSecret()
    if (secret) {
      const loopbackMint = mintDshAuthCookie(authority, secret)
      if (loopbackMint?.pair) {
        cachedCoreAuthCookie = loopbackMint.pair
        if (typeof options.onAuthCookie === 'function') {
          try { options.onAuthCookie(loopbackMint.pair) } catch (_) {}
        }
        return loopbackMint.pair
      }
    }
    return ''
  }
  const updateCachedAuthCookie = (cookie) => {
    if (cookie) {
      cachedCoreAuthCookie = cookie
      if (typeof options.onAuthCookie === 'function') {
        try { options.onAuthCookie(cookie) } catch (_) {}
      }
    }
  }
  resolveCoreAuthCookie()

  function prepareClientHeaders(headers, req) {
    const out = { ...headers }
    const secret = getBrowserAuthSecret()
    if (secret && req && req.headers && req.headers.host && !hasCoreAuthCookie(req.headers.cookie, req.headers.host)) {
      const clientMint = mintDshAuthCookie(req.headers.host, secret)
      if (clientMint) {
        const existing = out['set-cookie']
        const cookies = existing ? (Array.isArray(existing) ? [...existing] : [existing]) : []
        if (!cookies.some(c => typeof c === 'string' && c.startsWith(clientMint.name + '='))) {
          cookies.push(clientMint.setCookie)
          out['set-cookie'] = cookies.length === 1 ? cookies[0] : cookies
        }
      }
    }
    return out
  }
  const isPasswordAuth = () => options.state?.passwordAuth !== undefined ? Boolean(options.state.passwordAuth) : (typeof options.passwordAuth === 'function' ? Boolean(options.passwordAuth()) : Boolean(options.passwordAuth))
  const currentToken = () => {
    if (typeof options.token === 'function') return options.token()
    if (options.token) return options.token
    if (options.autoAuth === false) return ''
    try {
      const conn = context.get?.('connection')
      return conn !== undefined ? tokenFrom(conn.authenticatedUrl('http://' + authority)) : ''
    } catch (_) { return '' }
  }
  const streamTimeoutMs = options.streamTimeoutMs ?? 0
  const version = options.version || '0.7.17'
  const queueTimeoutMs = options.queueTimeoutMs ?? 15000
  // Prune idle sockets at 3500ms to avoid ECONNRESET races (#164).
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
    if (allowed(address, getRules())) return true
    refuse('access denied: address ' + String(address) + ' not in allowlist')
    return false
  }
  const handle = async (req, res) => {
    const isH2 = req.httpVersionMajor >= 2 || Boolean(res.stream)
    const remote = clientIp(req, getTrustedProxyCidrs())
    if (rejectBanned(res, options.banList, remote)) return
    if (!welcome(remote)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh-lanmode: access denied by allowlist rule')
      return
    }
    // Role check (Admin vs Guest)
    let role = resolveClientRole(remote, {
      adminRules: getAdminRules(),
      guestRules: getGuestRules(),
      defaultRules: getRules(),
    })
    const activePin = options.lanPinValue || (typeof options.lanPin === 'string' ? options.lanPin : '')
    if (role === 'guest' && activePin && verifyLanPin(req.headers, activePin)) {
      role = 'admin'
    }
    if (role === 'denied') {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh-lanmode: access denied by subnet rule')
      return
    }
    // Block administrative routes for guests (Fixes #141, #474)
    if (role === 'guest') {
      const url = req.url || ''
      if (isAdministrativeRoute(url, options.guestDenyExtra)) {
        if (Array.isArray(getGuestRules()) && getGuestRules().length > 0) {
          res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: 'Forbidden: Guest access does not permit administrative actions' }))
          return
        }
        if (!isPrivileged(url, getPrivilegedExtra())) {
          res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: 'Forbidden: Guest access does not permit administrative actions' }))
          return
        }
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
    const boundDenyUnlessAdmin = (r, s, am, pw, rem, rl) => denyUnlessAdmin(r, s, am, pw, rem, rl, options)
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
      denyUnlessAdmin: boundDenyUnlessAdmin,
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
      if (token) deviceRegistry.touch(hashToken(token), req)
    }
    const privileged = isPrivileged(req.url, getPrivilegedExtra())
    if (role === 'guest' && Array.isArray(getGuestRules()) && getGuestRules().length > 0 && privileged) {
      res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'Forbidden: Guest access does not permit privileged actions' }))
      return
    }
    const isCfTunnel = Boolean(getTunnelPin() && isCloudflareRequest(req.headers, req.socket && req.socket.remoteAddress, getTrustedProxyCidrs()))
    if (isCfTunnel || privileged) {
      const activeUnlocked = getUnlocked()
      if (privileged && !activeUnlocked) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('dsh-lanmode: ' + REFUSED)
        return
      }
      const { pin: activeLanPin, configuredRef } = await resolveActivePin()
      if (activeLanPin) {
        if (!challengePin(req, res, activeLanPin)) return
      } else if (configuredRef || (!isLoopbackAddress(remote) && !getAllowUnprivilegedLan())) {
        res.writeHead(403, {
          'content-type': 'text/plain; charset=utf-8',
          'x-dsh-lan-pin-required': '1',
        })
        res.end('dsh-lanmode: ' + PIN_REQUIRED)
        return
      }
    }
    // Guard against Cross-Site Request Forgery / Cross-Site mutating attacks (#328)
    if (!verifyBridgeOrigin(req, options)) {
      res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'Forbidden: Cross-site mutating request rejected by bridge' }))
      return
    }
    const patching = isConnectionBundle(req.url)
    const rewrittenHeaders = rewritten(req.headers, authority, remote, Boolean(options.tls))
    const cachedAuth = resolveCoreAuthCookie()
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
        if (answer.headers && answer.headers['set-cookie']) {
          const picked = pickDshAuthCookie(answer.headers['set-cookie'])
          if (picked) {
            updateCachedAuthCookie(picked)
          }
        }
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
            && (!options.adaptiveCompression || !isLocalLanClient(clientIp(req, getTrustedProxyCidrs())))

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
            res.writeHead(answer.statusCode || 502, isH2 ? filterH2Headers(prepareClientHeaders(outHeaders, req)) : prepareClientHeaders(outHeaders, req))
            answer.pipe(stream).pipe(res)
            return
          }

          res.writeHead(answer.statusCode || 502, isH2 ? filterH2Headers(prepareClientHeaders(answer.headers, req)) : prepareClientHeaders(answer.headers, req))
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
          res.writeHead(answer.statusCode || 502, isH2 ? filterH2Headers(prepareClientHeaders(out, req)) : prepareClientHeaders(out, req))
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

  const socketTracker = createActiveSocketsRegistry(authManager, deviceRegistry)
  if (options.state) options.state.activeSocketsTracker = socketTracker
  const activeSocketsRegistry = socketTracker.registry

  const upgrade = async (req, socket, head) => {
    let resolvedLanPin = getLanPin()
    let configuredRef = options.config?.lanPinRef || options.state?.config?.lanPinRef || options.state?.lanPinRef || options.lanPinRef || null
    try {
      const pinResult = await resolveActivePin()
      resolvedLanPin = pinResult.pin
      configuredRef = pinResult.configuredRef
    } catch (_) {}
    handleUpgrade(req, socket, head, {
      options, welcome, isPasswordAuth, authManager, deviceRegistry, rewritten,
      authority, upstreamPort, safeDestroy,
      resolveCoreAuthCookie,
      updateCachedAuthCookie,
      get browserAuthSecret() { return getBrowserAuthSecret() },
      get trustedProxyCidrs() { return getTrustedProxyCidrs() },
      banList: options.banList,
      get adminRules() { return getAdminRules() },
      get guestRules() { return getGuestRules() },
      get rules() { return getRules() },
      get privilegedExtra() { return getPrivilegedExtra() },
      lanPin: resolvedLanPin,
      configuredPinRef: configuredRef,
      get unlocked() { return getUnlocked() },
      get tunnelPin() { return getTunnelPin() },
      activeSocketsRegistry,
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
        + (getRules().length ? ', allow rules: ' + getRules().length : ', allow all')
        + (getUnlocked() ? (getLanPin() ? ', PIN required' : '') : ', privileged calls locked'))
    })
    servers.push(server)
  }

  return async () => {
    socketTracker.close()
    purgeFreeSockets(upstreamAgent)
    safeDestroy(upstreamAgent)
    safeDestroy(upstreamStreamAgent)
    await Promise.all(servers.map((s) => new Promise((resolve) => {
      try {
        if (typeof s.closeIdleConnections === 'function') s.closeIdleConnections()
        if (typeof s.closeAllConnections === 'function') s.closeAllConnections()
        s.close(() => resolve())
      } catch (_) { resolve() }
    })))
  }
}
