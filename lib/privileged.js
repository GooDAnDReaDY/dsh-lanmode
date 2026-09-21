// Privileged API access controls and LAN PIN protection.
//
// Certain sensitive endpoints (settings, credentials, agent presets, model discovery)
// are restricted to loopback origin by default in DeepSeek Harness core.
//
// The bridge polyfills Host and Origin headers. To secure the server across LAN:
// 1. unlockPrivileged: master toggle permitting remote settings access.
// 2. lanPin: optional PIN challenge for remote clients trying to call privileged APIs.

export const PRIVILEGED = [
  /^\/api\/settings\.(describe|openDocument|update|replace|mutate)$/,
  /^\/api\/credentials\.(describe|set|unset)$/,
  /^\/api\/agentPreset\.(read|copy|openDocument|remove)$/,
  /^\/api\/host\.(pickDirectory|openPath)$/,
  /^\/api\/llm\.discoverModels$/,
]

/** Check if a given URL path is a privileged endpoint. */
export function isPrivileged(url, extra) {
  const path = String(url ?? '').split('?')[0]
  if (!path) return false
  for (const rule of PRIVILEGED) if (rule.test(path)) return true
  for (const rule of extra ?? []) {
    try {
      if (new RegExp(rule).test(path)) return true
    } catch (_) {
      // Invalid user regex should not crash the bridge
    }
  }
  return false
}

/** Verify client PIN from headers or cookies. */
export function verifyLanPin(headers, expectedPin) {
  if (!expectedPin || typeof expectedPin !== 'string' || expectedPin.trim() === '') return true
  const target = expectedPin.trim()

  const pinHeader = headers?.['x-dsh-lan-pin']
  if (pinHeader && String(pinHeader).trim() === target) return true

  const cookies = String(headers?.cookie ?? '')
  const match = cookies.match(/(?:^|;\s*)dsh_lan_pin=([^;]+)/)
  if (match) {
    try {
      if (decodeURIComponent(match[1]).trim() === target) return true
    } catch (_) {
      if (match[1].trim() === target) return true
    }
  }

  return false
}

const failedAttempts = new Map()

/** Verify PIN rate limiting for client IP. */
export function checkPinRateLimit(ip) {
  if (!ip) return { allowed: true }
  const rec = failedAttempts.get(ip)
  if (!rec) return { allowed: true }
  const now = Date.now()
  if (rec.lockedUntil && rec.lockedUntil > now) {
    return { allowed: false, remainingMs: rec.lockedUntil - now }
  }
  return { allowed: true }
}

/** Record PIN attempt result. */
export function recordPinAttempt(ip, success) {
  if (!ip) return
  const now = Date.now()
  if (success) {
    failedAttempts.delete(ip)
    return
  }
  let rec = failedAttempts.get(ip)
  if (!rec) {
    rec = { count: 1, lockedUntil: 0 }
    failedAttempts.set(ip, rec)
  } else {
    rec.count++
    if (rec.count >= 5) {
      rec.lockedUntil = now + 30000
      rec.count = 0
    }
  }
}

export const REFUSED = 'dsh-lanmode: privileged call locked to loopback. Enable unlockPrivileged in settings to permit network access.'

export const PIN_REQUIRED = 'dsh-lanmode: PIN authentication required (x-dsh-lan-pin or cookie dsh_lan_pin) to access privileged settings.'

/**
 * Challenge PIN and rate limiting. Returns true if allowed, false if response already sent.
 */
export function challengePin(req, res, lanPin) {
  const ip = (req.socket && req.socket.remoteAddress) || ''
  const limit = checkPinRateLimit(ip)
  if (!limit.allowed) {
    const retrySec = Math.ceil(limit.remainingMs / 1000)
    res.writeHead(429, {
      'content-type': 'text/plain; charset=utf-8',
      'retry-after': String(retrySec),
      'x-dsh-lan-pin-retry-after': String(retrySec),
    })
    res.end('Too many failed PIN attempts. Please retry in ' + retrySec + 's.')
    return false
  }

  const valid = verifyLanPin(req.headers, lanPin)
  recordPinAttempt(ip, valid)
  if (!valid) {
    res.writeHead(403, {
      'content-type': 'text/plain; charset=utf-8',
      'x-dsh-lan-pin-required': '1',
    })
    res.end(PIN_REQUIRED)
    return false
  }
  return true
}

/** Reset PIN rate limiting map (for testing / manual admin unlock). */
export function resetPinRateLimit(ip) {
  if (ip) failedAttempts.delete(ip)
  else failedAttempts.clear()
}
