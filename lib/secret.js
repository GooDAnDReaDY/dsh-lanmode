// dsh-lanmode — Secure credential and secret management (Issue #96, #143).

export function makeCredentialRef(ref) {
  if (!ref) return null
  if (typeof ref === "object" && ref.ref) return ref
  return { ref: String(ref) }
}

const secretCache = new Map()
export const SECRET_POSITIVE_TTL_MS = 30_000
export const SECRET_NEGATIVE_TTL_MS = 5_000

export function clearSecretCache() {
  secretCache.clear()
}

function rememberSecret(ref, value, found, now) {
  const ttl = found ? SECRET_POSITIVE_TTL_MS : SECRET_NEGATIVE_TTL_MS
  secretCache.set(ref, { value, until: now + ttl })
  return value
}

export async function resolveSecret(ctx, ref, fallback, now = Date.now()) {
  const targetRef = ref ? (typeof ref === 'object' && ref.ref ? String(ref.ref).trim() : String(ref).trim()) : ""
  if (!targetRef) return fallback ? String(fallback).trim() : ""
  const hit = secretCache.get(targetRef)
  if (hit && hit.until > now) return hit.value
  try {
    let creds = null
    try {
      creds = typeof ctx?.get === 'function' ? ctx.get('credentials') : ctx?.credentials
    } catch (err) {
      void err
    }
    if (creds && typeof creds.resolve === "function") {
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
        return rememberSecret(targetRef, resolved, true, now)
      }
      if (resolved && (resolved.value || resolved.secret)) {
        return rememberSecret(targetRef, String(resolved.value || resolved.secret), true, now)
      }
    }
  } catch (err) {
    if (ctx?.logger && typeof ctx.logger.warn === "function") {
      ctx.logger.warn(`[dsh-lanmode] failed to resolve credential '${targetRef}': ${err?.message || err}`)
    }
  }
  if (typeof process !== "undefined" && process.env && process.env[targetRef]) {
    return rememberSecret(targetRef, process.env[targetRef], true, now)
  }
  const fallbackVal = fallback ? String(fallback).trim() : ""
  return rememberSecret(targetRef, fallbackVal, false, now)
}
