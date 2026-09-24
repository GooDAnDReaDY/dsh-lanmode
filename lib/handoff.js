// Remote authentication token handoff.
//
// DeepSeek Harness core generates a fresh token on each process startup.
// When remote clients access the bridge after a server restart, they may
// encounter a 401 Unauthorized challenge before receiving a session cookie.
// The bridge transparently redirects the browser to the same path with
// the authenticated token attached, allowing the core to issue a new cookie.

export const RETRY_MARK = 'dsh-lan-auth'

/**
 * Extract auth token from an authenticated URL.
 * @param {string} url
 * @returns {string} Token string or empty string
 */
export function tokenFrom(url) {
  if (typeof url !== 'string' || url === '') return ''
  try {
    return new URL(url).searchParams.get('token') ?? ''
  } catch (_) {
    return ''
  }
}

/**
 * Determine if client should be redirected with an auth token.
 */
export function shouldHandoff({ method, url, status, token }) {
  if (status !== 401) return false
  if (method !== 'GET') return false
  if (typeof token !== 'string' || token === '') return false
  const path = pathOf(url)
  if (path.pathname !== '/') return false
  return !path.searchParams.has(RETRY_MARK)
}

/**
 * Generate redirection target with fresh token and retry prevention mark.
 * Always relative (pathname + query) so reverse proxies keep the public
 * scheme/host — never embed the upstream absolute URL (Issue #273).
 */
export function handoffLocation(url, token) {
  const at = pathOf(url)
  at.searchParams.delete('token')
  at.searchParams.set('token', token)
  at.searchParams.set(RETRY_MARK, '1')
  const relative = at.pathname + '?' + at.searchParams.toString()
  // Guard: callers must never receive an absolute URL from this helper.
  if (/^https?:/i.test(relative)) {
    return '/?' + at.searchParams.toString()
  }
  return relative
}

function pathOf(url) {
  return new URL(typeof url === 'string' && url !== '' ? url : '/', 'http://dsh.invalid')
}
