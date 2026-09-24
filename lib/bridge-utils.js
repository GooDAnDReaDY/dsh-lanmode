// Utility helpers for dsh-lanmode direct bridge.
// Zero hardcoded Cyrillic characters.

import { parseAllow, allowed } from './access.js'

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

export function rewritten(headers, authority) {
  const out = { ...headers, host: authority }
  for (const key of Object.keys(out)) {
    if (key.startsWith(':')) delete out[key]
  }
  if (out.origin) out.origin = 'http://' + authority
  if (out.referer) out.referer = String(out.referer).replace(/^https?:\/\/[^/]+/, 'http://' + authority)
  delete out.connection
  delete out.upgrade
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

export function toRules(input, parseAllow) {
  if (!input) return []
  if (Array.isArray(input)) {
    if (input.length === 0) return []
    if (typeof input[0] === 'string') return parseAllow(input).rules
    return input
  }
  if (Array.isArray(input.rules)) return input.rules
  return []
}
