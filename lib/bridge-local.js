import os from 'node:os'
import path from 'node:path'

import { readLimitedBody, rejectTooLarge } from './body-limit.js'
import { renderLoginPage } from './login-page.js'
import { generateCachedQRSvg } from './qr.js'
import { readRootCA, generateAppleMobileConfig } from './tls.js'
import { countSockets } from './bridge-utils.js'
import { getCategorizedInterfaces } from './network-interfaces.js'


export function qrResponseCacheControl(explicitUrl) {
  return explicitUrl ? "public, max-age=3600" : "no-cache"
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

      // Apple Configuration Profile (.mobileconfig)
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
      const isPublic = url.startsWith('/dsh-lanmode/auth/')
        || url.startsWith('/dsh-lanmode/ca.crt')
        || url.startsWith('/dsh-lanmode/ca.der')
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
