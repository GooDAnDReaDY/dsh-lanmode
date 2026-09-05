// dsh-lanmode — безопасная работа с учетными данными и секретами (Issue #96).

export function makeCredentialRef(ref) {
  if (!ref) return null
  if (typeof ref === "object" && ref.ref) return ref
  return { ref: String(ref) }
}

export async function resolveSecret(ctx, ref, fallback) {
  const targetRef = ref ? String(ref).trim() : ""
  if (targetRef) {
    try {
      const creds = ctx?.credentials || (ctx?.get && ctx.get("credentials"))
      if (creds && typeof creds.resolve === "function") {
        const resolved = await creds.resolve(makeCredentialRef(targetRef))
        if (resolved && (resolved.value || resolved.secret)) {
          return resolved.value || resolved.secret
        }
      }
    } catch (_) {}
    if (typeof process !== "undefined" && process.env && process.env[targetRef]) {
      return process.env[targetRef]
    }
    return targetRef
  }
  return fallback ? String(fallback).trim() : ""
}
