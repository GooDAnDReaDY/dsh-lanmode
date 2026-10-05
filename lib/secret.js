// dsh-lanmode — Secure credential and secret management (Issue #96, #143, #361).

export function makeCredentialRef(ref) {
  if (!ref) return null
  if (typeof ref === 'object' && ref.ref) return ref
  return { ref: String(ref) }
}

let cacheVersion = 0
const ctxCaches = new WeakMap()
const globalCache = new Map()

export const SECRET_POSITIVE_TTL_MS = 30_000
export const SECRET_NEGATIVE_TTL_MS = 5_000

export function clearSecretCache() {
  globalCache.clear()
  cacheVersion += 1
}

function getCache(ctx) {
  if (ctx && typeof ctx === 'object') {
    let m = ctxCaches.get(ctx)
    if (!m) {
      m = new Map()
      ctxCaches.set(ctx, m)
    }
    return m
  }
  return globalCache
}

function rememberSecret(cache, ref, value, found, now) {
  const ttl = found ? SECRET_POSITIVE_TTL_MS : SECRET_NEGATIVE_TTL_MS
  cache.set(ref, { value, until: now + ttl, version: cacheVersion })
  return value
}

export async function resolveSecret(ctx, ref, fallback, now = Date.now()) {
  const targetRef = ref ? (typeof ref === 'object' && ref.ref ? String(ref.ref).trim() : String(ref).trim()) : ''
  if (!targetRef) return fallback ? String(fallback).trim() : ''
  const hasServiceContext = typeof ctx?.get === 'function'
  const cache = getCache(ctx)
  if (!hasServiceContext) {
    const hit = cache.get(targetRef)
    if (hit && hit.version === cacheVersion && hit.until > now) return hit.value
  }
  try {
    let creds = null
    try {
      creds = hasServiceContext ? ctx.get('credentials') : ctx?.credentials
    } catch (err) {
      void err
    }
    if (creds && typeof creds.resolve === 'function') {
      let resolved = null
      try {
        resolved = await creds.resolve(targetRef)
      } catch (err) { /* bestEffort */ void err }
      if ((!resolved || (typeof resolved === 'object' && !resolved.value && !resolved.secret)) && creds.resolve.length > 0) {
        try {
          resolved = await creds.resolve({ ref: targetRef })
        } catch (err) { /* bestEffort */ void err }
      }
      if (typeof resolved === 'string' && resolved) {
        if (hasServiceContext) return resolved
        return rememberSecret(cache, targetRef, resolved, true, now)
      }
      if (resolved && (resolved.value || resolved.secret)) {
        const val = String(resolved.value || resolved.secret)
        if (hasServiceContext) return val
        return rememberSecret(cache, targetRef, val, true, now)
      }
    }
  } catch (err) {
    if (ctx?.logger && typeof ctx.logger.warn === 'function') {
      ctx.logger.warn(`[dsh-lanmode] failed to resolve credential '${targetRef}': ${err?.message || err}`)
    }
  }
  if (typeof process !== 'undefined' && process.env && process.env[targetRef]) {
    if (hasServiceContext) return process.env[targetRef]
    return rememberSecret(cache, targetRef, process.env[targetRef], true, now)
  }
  const fallbackVal = fallback ? String(fallback).trim() : ''
  return rememberSecret(cache, targetRef, fallbackVal, false, now)
}
