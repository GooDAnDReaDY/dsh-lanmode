// Socket tracking and revocation registry for Direct Bridge (Issue #455, #456)
// Manages WebSocket eviction on session revocation and kill-switch.
// Zero hardcoded Cyrillic characters.

import { safeDestroy } from './bridge-utils.js'

export function createActiveSocketsRegistry(authManager, deviceRegistry) {
  const activeSocketsRegistry = new Set()

  const evictSocket = (id) => {
    if (!id) return
    for (const e of [...activeSocketsRegistry]) {
      if (e.sessionToken === id || e.sessionDigest === id || e.deviceToken === id || e.deviceHash === id) {
        safeDestroy(e.socket)
        safeDestroy(e.upstreamSocket)
        activeSocketsRegistry.delete(e)
      }
    }
  }

  const evictAllSockets = () => {
    for (const e of [...activeSocketsRegistry]) {
      safeDestroy(e.socket)
      safeDestroy(e.upstreamSocket)
      activeSocketsRegistry.delete(e)
    }
  }

  if (authManager && typeof authManager.on === 'function') {
    authManager.on('revoke', evictSocket)
  }

  let restoreRegistry = null
  if (deviceRegistry) {
    const origRevoke = typeof deviceRegistry.revoke === 'function' ? deviceRegistry.revoke.bind(deviceRegistry) : null
    const origRevokeAll = typeof deviceRegistry.revokeAll === 'function' ? deviceRegistry.revokeAll.bind(deviceRegistry) : null
    const origRevokeAllExcept = typeof deviceRegistry.revokeAllExcept === 'function' ? deviceRegistry.revokeAllExcept.bind(deviceRegistry) : null

    if (origRevoke) {
      deviceRegistry.revoke = (id) => {
        const ok = origRevoke(id)
        evictSocket(id)
        return ok
      }
    }
    if (origRevokeAll) {
      deviceRegistry.revokeAll = () => {
        const ok = origRevokeAll()
        evictAllSockets()
        return ok
      }
    }
    if (origRevokeAllExcept) {
      deviceRegistry.revokeAllExcept = (currentId) => {
        const ok = origRevokeAllExcept(currentId)
        for (const e of [...activeSocketsRegistry]) {
          if (e.sessionToken !== currentId && e.sessionDigest !== currentId && e.deviceToken !== currentId && e.deviceHash !== currentId) {
            safeDestroy(e.socket)
            safeDestroy(e.upstreamSocket)
            activeSocketsRegistry.delete(e)
          }
        }
        return ok
      }
    }
    restoreRegistry = () => {
      if (origRevoke) deviceRegistry.revoke = origRevoke
      if (origRevokeAll) deviceRegistry.revokeAll = origRevokeAll
      if (origRevokeAllExcept) deviceRegistry.revokeAllExcept = origRevokeAllExcept
    }
  }

  const close = () => {
    if (authManager && typeof authManager.off === 'function') {
      authManager.off('revoke', evictSocket)
    }
    if (restoreRegistry) restoreRegistry()
    for (const e of [...activeSocketsRegistry]) {
      safeDestroy(e.socket)
      safeDestroy(e.upstreamSocket)
    }
    activeSocketsRegistry.clear()
  }

  const listActiveSessions = () => {
    return [...activeSocketsRegistry].map((e, idx) => ({
      sessionId: e.sessionDigest || e.deviceHash || `ws-${idx}-${e.connectedAt}`,
      remote: e.remote,
      userAgent: e.userAgent || '',
      connectedAt: e.connectedAt || Date.now(),
      lastActiveAt: e.lastActiveAt || Date.now(),
    }))
  }

  return {
    registry: activeSocketsRegistry,
    evictSocket,
    evictAllSockets,
    listActiveSessions,
    close,
  }
}
