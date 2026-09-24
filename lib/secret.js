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
  const targetRef = ref ? String(ref).trim() : ""
  if (!targetRef) return fallback ? String(fallback).trim() : ""
  const hit = secretCache.get(targetRef)
  if (hit && hit.until > now) return hit.value
  try {
    const creds = ctx?.credentials || (ctx?.get && ctx.get("credentials"))
    if (creds && typeof creds.resolve === "function") {
      const resolved = await creds.resolve(makeCredentialRef(targetRef))
      if (resolved && (resolved.value || resolved.secret)) {
        return rememberSecret(targetRef, resolved.value || resolved.secret, true, now)
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
  return rememberSecret(targetRef, targetRef, false, now)
}
