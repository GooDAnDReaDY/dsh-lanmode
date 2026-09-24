// Merge a cached core dsh-auth cookie into proxied requests.
// The raw token is not logged. Callers pass the Set-Cookie header only.

const NAME = /^dsh-auth-[A-Za-z0-9_-]+=/

export function pickDshAuthCookie(setCookie) {
  const lines = Array.isArray(setCookie) ? setCookie : [setCookie]
  for (const line of lines) {
    const first = String(line ?? '').split(';')[0].trim()
    if (NAME.test(first)) return first
  }
  return ''
}

export function mergeDshAuthCookie(clientCookie, cachedPair) {
  const cached = String(cachedPair ?? '').trim()
  const current = String(clientCookie ?? '').trim()
  if (!cached || !NAME.test(cached)) return current
  if (current.split(';').some((part) => NAME.test(part.trim()))) return current
  return current ? current + '; ' + cached : cached
}
