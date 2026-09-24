// First-secret and last-credential guards for the config API.

import { isLoopbackAddress } from './access.js'

function trimmed(value) {
  return String(value || '').trim()
}

export function bootstrapBlocked(effective, patch, ip) {
  const had = trimmed(effective && effective.authPassword) || trimmed(effective && effective.authPasswordRef)
  if (had) return false
  const setsPassword = Object.prototype.hasOwnProperty.call(patch, 'authPassword') && trimmed(patch.authPassword)
  const setsRef = Object.prototype.hasOwnProperty.call(patch, 'authPasswordRef') && trimmed(patch.authPasswordRef)
  const turnsOn = patch && patch.passwordAuth === true
  if (!setsPassword && !setsRef && !turnsOn) return false
  return !isLoopbackAddress(ip)
}

export function lastAdminLockout(effective, patch) {
  const next = { ...(effective || {}), ...(patch || {}) }
  if (next.passwordAuth !== true) return false
  return !trimmed(next.authPassword) && !trimmed(next.authPasswordRef)
}
