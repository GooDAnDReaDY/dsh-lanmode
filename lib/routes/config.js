// Config read/write HTTP API for dsh-lanmode.
// Replaces the removed settingsScope (DSH 0.1.7+).
// Zero hardcoded Cyrillic characters.

import { resolveClientRole, verifyAdminAccess } from '../access.js'
import { clientIp } from '../bridge-utils.js'
import { readLimitedBody, rejectTooLarge } from '../body-limit.js'
import { bootstrapBlocked, lastAdminLockout } from '../admin-guard.js'
import { resetPinRateLimit, verifyLanPin, recordPinAttempt, PIN_REQUIRED } from '../privileged.js'
import { clearQRCache } from '../qr.js'
import { validateConfigPatch, isRestartRequired, persistConfigDurable } from '../config-validator.js'
import { resolveSecret } from '../secret.js'

const CONFIG_PATH = '/dsh-lanmode/api/config'

/**
 * Register GET and PATCH endpoints for reading and updating plugin config.
 * The client-side settings card uses these instead of settingsScope.
 *
 * @param {object} ctx       - Cordis context with webServer.
 * @param {object} effective - Current effective config (mutated in place).
 * @param {function|null} onConfigUpdated - Callback to trigger live config reload.
 */
export function registerConfigApi(ctx, effective, onConfigUpdated, access = {}) {
  if (!ctx.webServer || typeof ctx.webServer.register !== 'function') return
  access.ctx = ctx

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: CONFIG_PATH,
    handler: (req, res) => {
      const auth = authorizeConfig(req, access.state, effective)
      if (!auth.ok) {
        res.writeHead(auth.status || 403, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: auth.error }))
        return
      }
      if (req.method === 'GET' || req.method === 'HEAD') return handleGet(req, res, effective)
      if (req.method === 'PATCH') return handlePatch(req, res, effective, onConfigUpdated, access, ctx)
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', 'allow': 'GET, HEAD, PATCH' })
      res.end('Method Not Allowed')
    },
  }), 'dsh-lanmode: config HTTP API')
}

function authorizeConfig(req, state, effective) {
  if (!state) {
    return { ok: false, status: 403, error: 'Forbidden: Administrative access restricted' }
  }
  const trustedProxies = effective?.trustedProxyCidrs || state?.trustedProxyCidrs || ['127.0.0.0/8', '::1/128']
  const ip = clientIp(req, trustedProxies)
  const role = resolveClientRole(ip, {
    adminRules: state.adminRules,
    guestRules: state.guestRules,
    defaultRules: state.rules,
  })
  if (role === 'guest') {
    return { ok: false, status: 403, error: 'Forbidden: Guest role cannot access configuration' }
  }
  return verifyAdminAccess(req, { state, config: effective, clientIp: ip, role })
}

function handleGet(req, res, effective) {
  const safe = sanitize(effective)
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify({ status: 'ready', value: safe }))
}

function handlePatch(req, res, effective, onConfigUpdated, access = {}, ctx = null) {
  readLimitedBody(req).then(async (limited) => {
    if (!limited.ok) {
      rejectTooLarge(res, req)
      return
    }
    const body = limited.text
    try {
      const patch = JSON.parse(body || '{}')
      const { Config } = await import('../config-schema.js')
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'Body must be a JSON object' }))
        return
      }

      const trustedProxies = effective?.trustedProxyCidrs || access.state?.trustedProxyCidrs || ['127.0.0.0/8', '::1/128']
      const clientIpAddr = clientIp(req, trustedProxies)

      // Issue #366: LAN PIN protects config API mutations from unauthorized network modifications
      const currentPin = (effective && effective.lanPin) || (access.state && access.state.lanPin ? effective.lanPin : '')
      if (currentPin) {
        const valid = verifyLanPin(req.headers, currentPin)
        recordPinAttempt(clientIpAddr, valid)
        if (!valid) {
          res.writeHead(403, {
            'content-type': 'application/json; charset=utf-8',
            'x-dsh-lan-pin-required': '1',
          })
          res.end(JSON.stringify({ error: PIN_REQUIRED }))
          return
        }
      }

      const setupIp = clientIpAddr
      if (lastAdminLockout(effective, patch)) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'Refusing to remove the only admin credential' }))
        return
      }
      if (bootstrapBlocked(effective, patch, setupIp)) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'Initial admin setup is loopback-only' }))
        return
      }

      // Issue #362: Ignore masked credential fields ('***') so saving settings does not overwrite credentials
      if (patch.authPassword === '***' || patch.authPassword === '') {
        delete patch.authPassword
      }
      if (patch.lanPin === '***') {
        delete patch.lanPin
      }
      if (patch.tunnelToken === '***') {
        delete patch.tunnelToken
      }

      // Issue #363: Validate keys and values against schema. Reject immediately without mutating state on error.
      const schemaKeys = Object.keys(Config.dict || {})
      const validation = validateConfigPatch(patch, effective, schemaKeys)
      if (!validation.valid) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'Validation failed', errors: validation.errors }))
        return
      }

      // Issue #365: Validate that newly specified lanPinRef resolves or has valid fallback
      if (patch.lanPinRef) {
        const rawFallback = patch.lanPin !== undefined ? patch.lanPin : (effective.lanPin || '')
        const testResolved = await resolveSecret(ctx || access.ctx, patch.lanPinRef, rawFallback)
        if (!testResolved) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({
            error: "Failed to resolve credential reference '" + patch.lanPinRef + "': provider returned empty and no valid fallback was configured.",
          }))
          return
        }
      }

      // Calculate whether host restart is required before applying patch
      const restartNeeded = isRestartRequired(patch, effective)

      // Create candidate config to persist first (Issue #364)
      const candidate = Object.assign({}, effective, patch)

      // Issue #364: Persist configuration durably via DSH profile mechanism BEFORE mutating live state
      const persistTargetCtx = ctx || access.ctx
      const persistResult = await persistConfigDurable(persistTargetCtx, candidate, access)
      if (!persistResult.ok) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: persistResult.error || 'Failed to save configuration durably' }))
        return
      }

      const passwordChanging = Object.prototype.hasOwnProperty.call(patch, 'authPassword')
        || Object.prototype.hasOwnProperty.call(patch, 'authPasswordRef')

      // Apply patch atomically only after durable persistence succeeds
      for (const key of Object.keys(patch)) {
        effective[key] = patch[key]
      }

      // Issue #259: password change invalidates other sessions immediately.
      if (passwordChanging) {
        const authManager = access.state && access.state.authManager
        if (authManager && typeof authManager.revokeSessionsForUser === 'function') {
          const user = effective.authUser || 'admin'
          const except = typeof authManager.extractToken === 'function'
            ? authManager.extractToken(req)
            : null
          authManager.revokeSessionsForUser(user, except)
        }
      }

      clearQRCache()
      if (passwordChanging || patch.lanPin || patch.lanPinRef) {
        resetPinRateLimit()
      }

      // Issue #365: Live config update propagates to running state & bridge
      if (typeof onConfigUpdated === 'function') {
        try {
          await onConfigUpdated(effective)
        } catch (updateErr) {
          if (ctx?.logger && typeof ctx.logger.error === 'function') {
            ctx.logger.error('[dsh-lanmode] onConfigUpdated error: ' + (updateErr?.message || updateErr))
          }
        }
      }

      const safe = sanitize(effective)
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        status: 'ready',
        value: safe,
        applied: Object.keys(patch).length,
        restart: restartNeeded,
      }))
    } catch (err) {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'Invalid JSON: ' + String(err.message || err) }))
    }
  })
}

/** Strip secret values from config before sending to client. */
function sanitize(config) {
  const result = Object.assign({}, config)
  // Mask actual password and PIN values, keep refs.
  if (result.lanPin) result.lanPin = '***'
  if (result.tunnelToken) result.tunnelToken = '***'
  if (result.authPassword) result.authPassword = '***'
  return result
}
