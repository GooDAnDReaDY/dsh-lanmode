import os from 'node:os'
import path from 'node:path'

import { readLimitedBody, rejectTooLarge } from './body-limit.js'
import { renderLoginPage } from './login-page.js'
import { generateCachedQRSvg } from './qr.js'
import { readRootCA, generateAppleMobileConfig } from './tls.js'
import { countSockets } from './bridge-utils.js'
import { getCategorizedInterfaces } from './network-interfaces.js'
import { allowed, parseAllow } from './access.js'
import { assertGuarded, isPublicPluginPath } from './route-guard.js'
import { SELF_LOCK } from './bans.js'


export function qrResponseCacheControl(explicitUrl) {
  return explicitUrl ? "public, max-age=3600" : "no-cache"
}

const LOOPBACK_RULES = parseAllow(['127.0.0.0/8', '::1/128']).rules

export function isStrictLoopback(ip) {
  return allowed(ip, LOOPBACK_RULES)
}

assertGuarded()

export const REOPEN_SW = `
self.addEventListener('message', function (event) {
  var data = event.data || {}
  if (data.type !== 'dsh-lanmode-token' || !data.token) return
  event.waitUntil(caches.open('dsh-lanmode-reopen').then(function (cache) {
    return cache.put('/dsh-lanmode/reopen-token', new Response(String(data.token)))
  }))
})
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url)
  if (event.request.mode !== 'navigate' || url.pathname !== '/' || url.searchParams.get('token')) return
  event.respondWith(caches.open('dsh-lanmode-reopen').then(function (cache) {
    return cache.match('/dsh-lanmode/reopen-token').then(function (saved) {
      if (!saved) return fetch(event.request)
      return saved.text().then(function (token) {
        if (!token) return fetch(event.request)
        url.searchParams.set('token', token)
        return Response.redirect(url.toString(), 302)
      })
    })
  }))
})
`


function pairLocation(pathname, token) {
  const encoded = encodeURIComponent(token)
  if (pathname === '/dsh-lanmode/pair-accept') return '/dsh-lanmode/pair-app?token=' + encoded
  return '/?token=' + encoded
}

function handlePairRoute(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Method Not Allowed')
    return true
  }
  let token = ''
  try {
    token = new URL(req.url, 'http://dsh.invalid').searchParams.get('token') || ''
  } catch {
    token = ''
  }
  if (!token || token.length > 512 || /[\s\u0000-\u001f]/.test(token)) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    res.end('dsh-lanmode: pairing token is missing')
    return true
  }
  const pathname = String(req.url || '').split('?')[0]
  res.writeHead(302, { location: pairLocation(pathname, token), 'cache-control': 'no-store' })
  res.end()
  return true
}


function handleBanRoute(req, res, deps) {
  const { options, authManager, isPasswordAuth, remote, role, denyUnlessAdmin } = deps
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Method Not Allowed')
    return true
  }
  if (typeof denyUnlessAdmin === 'function'
    && !denyUnlessAdmin(req, res, authManager, isPasswordAuth, remote, role)) {
    return true
  }
  const list = options && options.banList
  if (!list || typeof list.ban !== 'function') {
    res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'Ban list unavailable' }))
    return true
  }
  readLimitedBody(req).then((limited) => finishBan(res, limited, list, remote, options))
  return true
}

function finishBan(res, limited, list, remote, options) {
  if (!limited.ok) {
    res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Payload Too Large')
    return
  }
  let body
  try {
    body = JSON.parse(limited.text || '{}')
  } catch {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'Invalid JSON' }))
    return
  }
  try {
    list.ban(body && body.ip, remote)
  } catch (err) {
    const code = err && err.code
    const status = code === SELF_LOCK || code === 'LOOPBACK' ? 409 : 400
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ error: code || 'BAN_REJECTED' }))
    return
  }
  if (typeof options.persistBans === 'function') {
    try { options.persistBans() } catch { /* memory ban stands */ }
  }
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ ok: true }))
}

export function handleBridgeLocalRoutes(req, res, deps) {
  const {
    options, authManager, isPasswordAuth, version, hosts,
    upstreamAgent, upstreamStreamAgent,
    activeConnections, totalBytesSent, totalBytesReceived,
    deviceRegistry, remote, role, currentToken, denyUnlessAdmin,
  } = deps
    // Static / utility endpoints
    if (req.url) {
      const pathname = req.url.split('?')[0]

      if (pathname === '/dsh-lanmode/pair-accept' || pathname === '/dsh-lanmode/pair-app') {
        return handlePairRoute(req, res)
      }

      if (pathname === '/dsh-lanmode/bans') {
        return handleBanRoute(req, res, {
          options, authManager, isPasswordAuth, remote, role, denyUnlessAdmin,
        })
      }


      // Apple Configuration Profile (.mobileconfig)
      // #202: local desktop may fetch the harness token without the LAN PIN.
      if (pathname === '/dsh-lanmode/sw.js') {
        res.writeHead(200, {
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': 'no-cache',
          'service-worker-allowed': '/',
        })
        res.end(REOPEN_SW)
        return true
      }

      if (pathname === '/dsh-lanmode/loopback-token') {
        if (req.method !== 'GET') {
          res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('Method Not Allowed')
          return true
        }
        if (!isStrictLoopback(remote)) {
          res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
          res.end('dsh-lanmode: loopback token is local only')
          return true
        }
        if (isPasswordAuth() && authManager) {
          const session = authManager.validateSession(authManager.extractToken(req))
          if (!session) {
            res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
            res.end('dsh-lanmode: authentication required')
            return true
          }
        }
        const token = typeof currentToken === 'function' ? currentToken() : ''
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ token: token || '' }))
        return true
      }

      if (pathname === '/dsh-lanmode/ca.mobileconfig') {
        const caPem = (options.tls && options.tls.caCert) || readRootCA(path.join(os.homedir(), '.dsh'))
        if (!caPem) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('dsh-lanmode: Root CA certificate not available')
          return true
        }
        const mobileConfig = generateAppleMobileConfig(caPem)
        res.writeHead(200, {
          'content-type': 'application/x-apple-aspen-config',
          'content-disposition': 'attachment; filename="dsh-ca.mobileconfig"',
          'cache-control': 'public, max-age=3600',
        })
        res.end(mobileConfig)
        return true
      }

    // #103: Password authentication
    if (isPasswordAuth() && authManager) {
      const url = req.url || ''
      const isPublic = isPublicPluginPath(url)

      if (!isPublic) {
        const token = authManager.extractToken(req)
        const session = token ? authManager.validateSession(token) : null
        if (!session) {
          const accept = req.headers['accept'] || ''
          const isHtml = accept.includes('text/html') || (req.method === 'GET' && !url.includes('/api/'))
          if (isHtml) {
            const requestHost = String(req.headers.host || '').split(':')[0]
            const html = renderLoginPage({
              https: Boolean(options.tls),
              defaultUser: options.authUser || 'admin',
              version,
              publicHost: options.publicHost || requestHost,
            })
            res.writeHead(200, {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
            })
            res.end(html)
            return true
          } else {
            res.writeHead(401, {
              'content-type': 'application/json; charset=utf-8',
              'x-dsh-auth-required': '1',
            })
            res.end(JSON.stringify({ error: 'Authentication required', authRequired: true }))
            return true
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
        return true
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
        return true
      }

      // Devices API: List
      if (pathname === '/dsh-lanmode/api/devices' && req.method === 'GET') {
        if (!denyUnlessAdmin(req, res, authManager, isPasswordAuth(), remote, role)) return true
        const list = deviceRegistry ? deviceRegistry.list() : []
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-cache',
        })
        res.end(JSON.stringify(list))
        return true
      }

      // Devices API: Revoke
      if (pathname === '/dsh-lanmode/api/devices/revoke' && req.method === 'POST') {
        if (!denyUnlessAdmin(req, res, authManager, isPasswordAuth(), remote, role)) return true
        readLimitedBody(req).then((limited) => {
          if (!limited.ok) {
            rejectTooLarge(res, req)
            return true
          }
          const body = limited.text
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
        return true
      }

      // Devices API: Revoke Others
      if (pathname === '/dsh-lanmode/api/devices/revoke-others' && req.method === 'POST') {
        if (!denyUnlessAdmin(req, res, authManager, isPasswordAuth(), remote, role)) return true
        readLimitedBody(req).then((limited) => {
          if (!limited.ok) {
            rejectTooLarge(res, req)
            return true
          }
          const body = limited.text
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
        return true
      }

      // The live QR embeds the current harness token. The browser revalidates
      // it, so a new token is drawn on the next request. An explicit url is cached.
      if (pathname === '/dsh-lanmode/qr') {
        const queryIdx = req.url.indexOf('?')
        const params = new URLSearchParams(queryIdx !== -1 ? req.url.slice(queryIdx) : '')
        const explicitUrl = params.get('url')
        let targetText = explicitUrl
        if (!targetText) {
          const scheme = options.tls ? 'https' : 'http'
          const host = (req.headers.host || `${hosts[0]}:${options.port}`).split(':')[0]
          const token = currentToken()
          targetText = `${scheme}://${host}:${options.port}/${token ? '?token=' + token : ''}`
        }
        const cacheControl = qrResponseCacheControl(explicitUrl)

        const cached = generateCachedQRSvg(targetText, {
          size: parseInt(params.get('size'), 10) || 240,
          margin: parseInt(params.get('margin'), 10) || 1,
        })

        const ifNoneMatch = req.headers['if-none-match']
        if (ifNoneMatch && ifNoneMatch === cached.etag) {
          res.writeHead(304, {
            'ETag': cached.etag,
            'Cache-Control': cacheControl,
            'Vary': 'Accept-Encoding',
          })
          res.end()
          return true
        }

        res.writeHead(200, {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(cached.svg),
          'ETag': cached.etag,
          'Cache-Control': cacheControl,
          'Vary': 'Accept-Encoding',
        })
        res.end(cached.svg)
        return true
      }
    }
  return false
}
