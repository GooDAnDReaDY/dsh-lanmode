// Access control and CIDR matching for LAN and direct mode.
//
// No external dependencies: addresses are parsed into byte arrays,
// and the first N bits are compared against CIDR prefix masks.
// Supports both IPv4 and IPv6 (including IPv4-mapped IPv6 ::ffff:x.x.x.x).

/** IPv4 address bytes, or null if invalid. */
function ipv4Bytes(text) {
  const parts = text.split('.')
  if (parts.length !== 4) return null
  const bytes = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    bytes.push(value)
  }
  return bytes
}

/**
 * IPv6 address bytes, or null if invalid.
 * Handles IPv4-mapped IPv6 addresses (::ffff:192.168.1.5) transparently.
 */
function ipv6Bytes(text) {
  let body = text
  let tail = []
  const dot = body.lastIndexOf(':')
  if (body.includes('.')) {
    const four = ipv4Bytes(body.slice(dot + 1))
    if (!four) return null
    tail = four
    body = body.slice(0, dot + 1) + '0:0'
  }

  const halves = body.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : []
  if (halves.length === 1 && head.length !== 8) return null

  const groups = []
  for (const group of head) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
    groups.push(Number.parseInt(group, 16))
  }
  const restGroups = []
  for (const group of rest) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
    restGroups.push(Number.parseInt(group, 16))
  }
  const missing = 8 - groups.length - restGroups.length
  if (missing < 0) return null
  const all = halves.length === 2
    ? groups.concat(new Array(missing).fill(0), restGroups)
    : groups

  const bytes = []
  for (const group of all) bytes.push(group >> 8, group & 255)
  if (tail.length) {
    bytes.splice(12, 4, ...tail)
  }
  return bytes.length === 16 ? bytes : null
}

/** Returns parsed address bytes or null if invalid. */
export function addressBytes(text) {
  const clean = String(text ?? '').trim()
  if (!clean) return null
  if (clean.includes(':')) return ipv6Bytes(clean)
  return ipv4Bytes(clean)
}

/** Extracts IPv4 bytes from IPv4-mapped IPv6 address. */
function unwrapped(bytes) {
  if (!bytes || bytes.length !== 16) return null
  for (let i = 0; i < 10; i++) if (bytes[i] !== 0) return null
  if (bytes[10] !== 255 || bytes[11] !== 255) return null
  return bytes.slice(12)
}

/**
 * Parses a single allow rule (IP address or CIDR notation).
 * @returns {{ bytes: number[], bits: number } | null}
 */
export function parseRule(text) {
  const clean = String(text ?? '').trim()
  if (!clean) return null
  const slash = clean.lastIndexOf('/')
  const address = slash === -1 ? clean : clean.slice(0, slash)
  const bytes = addressBytes(address)
  if (!bytes) return null

  const full = bytes.length * 8
  if (slash === -1) return { bytes, bits: full }
  const bits = Number(clean.slice(slash + 1))
  if (!Number.isInteger(bits) || bits < 0 || bits > full) return null
  return { bytes, bits }
}

/** Parses a list of rules, filtering out invalid entries. */
export function parseAllow(list) {
  const rules = []
  const dropped = []
  for (const item of Array.isArray(list) ? list : []) {
    const rule = parseRule(item)
    if (rule) rules.push(rule)
    else if (String(item ?? '').trim()) dropped.push(String(item))
  }
  return { rules, dropped }
}

/** Checks whether the first N bits match between two byte arrays. */
function samePrefix(left, right, bits) {
  if (left.length !== right.length) return false
  const whole = bits >> 3
  for (let i = 0; i < whole; i++) if (left[i] !== right[i]) return false
  const spare = bits & 7
  if (spare === 0) return true
  const mask = (255 << (8 - spare)) & 255
  return (left[whole] & mask) === (right[whole] & mask)
}

/** Checks if an address matches any rule in the given list. */
export function allowed(address, rules) {
  if (!Array.isArray(rules) || rules.length === 0) return true
  const bytes = addressBytes(address)
  if (!bytes) return false
  const inner = unwrapped(bytes)

  for (const rule of rules) {
    if (samePrefix(bytes, rule.bytes, rule.bits)) return true
    if (inner && rule.bytes.length === 4 && samePrefix(inner, rule.bytes, rule.bits)) return true
  }
  return false
}

/**
 * Resolves the client role ('admin', 'guest', or 'denied') based on CIDR subnet rules.
 *
 * @param {string} address Client remote address
 * @param {object} options
 * @param {Array} [options.adminRules] Explicit admin CIDR rules
 * @param {Array} [options.guestRules] Explicit guest CIDR rules
 * @param {Array} [options.defaultRules] Default CIDR rules (allow list)
 * @returns {'admin' | 'guest' | 'denied'}
 */
export function resolveClientRole(address, { adminRules, guestRules, defaultRules } = {}) {
  // 1. Explicit admin list specified
  if (Array.isArray(adminRules) && adminRules.length > 0) {
    if (allowed(address, adminRules)) return 'admin'
    if (Array.isArray(guestRules) && guestRules.length > 0 && allowed(address, guestRules)) {
      return 'guest'
    }
    return 'denied'
  }

  // 2. Default allow list
  if (Array.isArray(defaultRules) && defaultRules.length > 0) {
    if (!allowed(address, defaultRules)) return 'denied'
    // If inside allowed, check if marked as guest
    if (Array.isArray(guestRules) && guestRules.length > 0 && allowed(address, guestRules)) {
      return 'guest'
    }
    return 'admin'
  }

  // 3. No restrictions specified: check if explicitly marked as guest
  if (Array.isArray(guestRules) && guestRules.length > 0 && allowed(address, guestRules)) {
    return 'guest'
  }

  return 'admin'
}

/** Check if an IP address is a loopback address. */
export function isLoopbackAddress(address) {
  if (!address || typeof address !== 'string') return false
  const clean = address.trim()
  if (clean === '127.0.0.1' || clean === '::1' || clean === '::ffff:127.0.0.1') return true
  if (clean.startsWith('127.')) return true
  return false
}

/** Administrative and sensitive routes requiring admin privileges. */
export const ADMINISTRATIVE_ROUTES = [
  '/api/settings',
  '/api/plugins',
  '/dsh-lanmode/devices/revoke',
  '/dsh-lanmode/devices/kill-all',
  '/dsh-lanmode/api/devices/revoke-others',
  '/dsh-lanmode/tunnel/toggle',
  '/dsh-lanmode/devices',
]

/**
 * Check if the given request path corresponds to an administrative endpoint.
 * @param {string} pathname
 * @returns {boolean}
 */
export function isAdministrativeRoute(pathname) {
  if (!pathname || typeof pathname !== 'string') return false
  const clean = pathname.split('?')[0]
  for (const route of ADMINISTRATIVE_ROUTES) {
    if (clean === route || clean.startsWith(route + '/')) return true
  }
  return false
}

/**
 * Validates request Origin and Sec-Fetch-Site headers to guard against CSRF.
 * @param {object} req
 * @returns {boolean}
 */
export function isTrustedSameOrigin(req) {
  if (!req || !req.headers) return true
  const secFetch = req.headers['sec-fetch-site']
  if (secFetch === 'cross-site') return false

  const origin = req.headers['origin']
  const host = req.headers['host']
  if (origin && host) {
    try {
      const originUrl = new URL(origin)
      if (originUrl.host !== host) {
        if (!isLoopbackAddress(originUrl.hostname) && originUrl.hostname !== 'localhost') {
          return false
        }
      }
    } catch (_) {
      return false
    }
  }
  return true
}

/**
 * Centralized fail-closed authorization gate for administrative routes.
 * Defense-in-depth protection against direct bridge bypass (Issues #142, #132).
 *
 * @param {object} req Incoming HTTP request
 * @param {object} options
 * @param {object} [options.state] Plugin runtime state (authManager, rules, etc.)
 * @param {object} [options.config] Plugin configuration
 * @param {string} options.clientIp Client remote IP address
 * @param {'admin'|'guest'|'denied'} options.role Resolved client role
 * @returns {{ ok: boolean, status?: number, error?: string, session?: object|null }}
 */
export function verifyAdminAccess(req, { state, config, clientIp, role }) {
  // 1. Explicit role denial or guest restriction
  if (role === 'denied' || role === 'guest') {
    return {
      ok: false,
      status: 403,
      error: 'Forbidden: Guest role cannot perform administrative actions',
    }
  }

  // 2. Anti-CSRF protection for state-mutating requests
  const method = req?.method || 'GET'
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    if (!isTrustedSameOrigin(req)) {
      return {
        ok: false,
        status: 403,
        error: 'Forbidden: Cross-site request rejected',
      }
    }
  }

  // 3. Password authentication mode check
  const isPasswordAuth = Boolean(config?.passwordAuth ?? state?.passwordAuth)
  const authManager = state?.authManager
  if (isPasswordAuth && authManager) {
    const token = authManager.extractToken(req)
    const session = token ? authManager.validateSession(token) : null
    if (!session) {
      return {
        ok: false,
        status: 401,
        error: 'Authentication required: valid session token required',
      }
    }
    return { ok: true, session }
  }

  // 4. In passwordAuth: false mode:
  // Allow loopback calls (e.g. from local DSH WebUI or bridge forward)
  if (isLoopbackAddress(clientIp)) {
    return { ok: true, session: null }
  }

  // For non-loopback direct calls, require admin role
  if (role === 'admin') {
    return { ok: true, session: null }
  }

  return {
    ok: false,
    status: 403,
    error: 'Forbidden: Administrative access restricted',
  }
}
