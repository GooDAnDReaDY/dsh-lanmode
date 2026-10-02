// Utility helpers for dsh-lanmode direct bridge.
// Zero hardcoded Cyrillic characters.

import { parseAllow, allowed, isTrustedLocalAuthority } from './access.js'
import { resolveUpstreamPort } from './upstream-port.js'

/**
 * Safely destroy a network stream or socket during teardown.
 * Swallowing errors here is intentional: calling destroy() on an already closed,
 * reset, or aborted stream is a normal lifecycle cleanup event.
 */
export function safeDestroy(target, err) {
  if (!target || typeof target.destroy !== 'function') return
  try {
    target.destroy(err)
  } catch (_) {
    // Teardown cleanup: socket might already be destroyed
  }
}

export function rewritten(headers, authority, clientAddress = '', isTls = false) {
  const out = { ...headers, host: authority }
  for (const key of Object.keys(out)) {
    if (key.startsWith(':')) delete out[key]
  }
  if (out.origin) out.origin = 'http://' + authority
  if (out.referer) out.referer = String(out.referer).replace(/^https?:\/\/[^/]+/, 'http://' + authority)
  delete out.connection
  delete out.upgrade
  if (clientAddress) {
    const existingXff = out['x-forwarded-for']
    out['x-forwarded-for'] = existingXff ? `${existingXff}, ${clientAddress}` : clientAddress
  }
  if (!out['x-forwarded-proto']) {
    out['x-forwarded-proto'] = isTls ? 'https' : 'http'
  }
  return out
}

export function throttle(log, everyMs) {
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

export function countSockets(map) {
  if (!map) return 0
  let total = 0
  for (const key of Object.keys(map)) {
    const list = map[key]
    if (Array.isArray(list)) total += list.length
  }
  return total
}

export function relaxTimeouts(server, streamTimeoutMs) {
  server.requestTimeout = 0
  server.headersTimeout = 60000
  server.keepAliveTimeout = 65000
  server.timeout = streamTimeoutMs
}

/**
 * Filter out forbidden HTTP/2 hop-by-hop headers from backend HTTP/1.1 response.
 * In HTTP/2 (RFC 7540 / RFC 9113), connection-specific headers are prohibited
 * and will cause the stream to be reset with ERR_HTTP2_INVALID_CONNECTION_HEADERS.
 */
export function filterH2Headers(headers) {
  if (!headers) return {}
  const out = { ...headers }
  delete out['connection']
  delete out['keep-alive']
  delete out['transfer-encoding']
  delete out['upgrade']
  delete out['proxy-connection']
  delete out['trailer']
  return out
}

export function isTrustedProxy(remoteAddress, trustedProxyCidrs = DEFAULT_TRUSTED_PROXY_CIDRS) {
  if (!remoteAddress) return false
  const list = Array.isArray(trustedProxyCidrs) && trustedProxyCidrs.length
    ? trustedProxyCidrs
    : DEFAULT_TRUSTED_PROXY_CIDRS
  const { rules } = parseAllow(list)
  return Boolean(allowed(remoteAddress, rules))
}

export const DEFAULT_TRUSTED_PROXY_CIDRS = ['127.0.0.0/8', '::1/128']

/**
 * Resolve the client IP for rate limits and allowlists.
 * X-Forwarded-For / CF-Connecting-IP are honoured only when the immediate
 * peer is inside trustedProxyCidrs (Issue #269).
 */
export function clientIp(req, trustedProxyCidrs = DEFAULT_TRUSTED_PROXY_CIDRS) {
  const remote = (req.socket && req.socket.remoteAddress) || ''
  const list = Array.isArray(trustedProxyCidrs) && trustedProxyCidrs.length
    ? trustedProxyCidrs
    : DEFAULT_TRUSTED_PROXY_CIDRS
  const { rules } = parseAllow(list)
  if (!remote || !allowed(remote, rules)) return remote

  const headers = req.headers || {}
  const cf = headers['cf-connecting-ip']
  if (typeof cf === 'string' && cf.trim()) {
    return cf.trim().split(',')[0].trim()
  }
  const xff = headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim()
  }
  return remote
}

export function toRules(input, parseAllowFn = parseAllow) {
  if (!input) return []
  if (Array.isArray(input)) {
    if (input.length === 0) return []
    if (typeof input[0] === 'string') return parseAllowFn(input).rules
    return input
  }
  if (Array.isArray(input.rules)) return input.rules
  return []
}

export function verifyBridgeOrigin(req, options) {
  const isUpgrade = Boolean(req?.headers?.upgrade || (req?.headers?.connection && String(req.headers.connection).toLowerCase().includes('upgrade')))
  const method = req?.method || 'GET'
  if (!isUpgrade && (method === 'GET' || method === 'HEAD' || method === 'OPTIONS')) return true
  const secFetch = req?.headers?.['sec-fetch-site']
  if (secFetch === 'cross-site') return false
  const origin = req?.headers?.['origin'] || req?.headers?.['Origin']
  if (!origin) return true
  try {
    const originUrl = new URL(origin)
    const reqHost = req.headers?.['host'] ? req.headers['host'].split(':')[0].toLowerCase() : ''
    const originHost = originUrl.hostname.toLowerCase()
    if (secFetch === 'same-site' && !isTrustedLocalAuthority(originHost, options)) return false
    if (!isTrustedLocalAuthority(originHost, options) && originHost !== reqHost) return false
    return true
  } catch (_) {
    return false
  }
}

export function purgeFreeSockets(agent) {
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

export function listenAfterPortDiscovery(context, options, startBridge) {
  const log = typeof options.log === 'function' ? options.log : () => {}
  let cancelled = false
  let stop = () => {}
  const probe = typeof options.probeUpstreamPort === 'function' ? options.probeUpstreamPort : undefined
  resolveUpstreamPort(context && context.webServer, probe)
    .then((port) => {
      const found = Number(port)
      if (cancelled || !Number.isInteger(found) || found <= 0) {
        if (!cancelled) log('Direct bridge not started: web server port unknown')
        return
      }
      const webServer = Object.assign({}, context && context.webServer, { port: found })
      stop = startBridge(Object.assign({}, context, { webServer }), options)
    })
    .catch((err) => {
      if (!cancelled) log('Direct bridge discovery failed: ' + String(err && err.message || err))
    })
  return () => {
    cancelled = true
    stop()
  }
}
