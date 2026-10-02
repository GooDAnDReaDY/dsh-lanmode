// Validation, lifecycle persistence and state update helpers for dsh-lanmode configuration.
// Zero hardcoded Cyrillic characters.

import { parseRule, parseAllow } from './access.js'

const BOOLEAN_KEYS = new Set([
  'settings',
  'randomUuid',
  'clipboard',
  'mdns',
  'pwa',
  'mobileEnterSends',
  'unlockPrivileged',
  'tunnelPin',
  'passwordAuth',
  'adaptiveCompression',
  'diagnostics',
])

const STRING_KEYS = new Set([
  'directHost',
  'mdnsName',
  'tlsDir',
  'tlsCert',
  'tlsKey',
  'lanPin',
  'lanPinRef',
  'tunnelToken',
  'tunnelTokenRef',
  'authUser',
  'authPassword',
  'authPasswordRef',
  'publicHost',
])

const STRING_ARRAY_KEYS = new Set([
  'tlsHosts',
  'privilegedExtra',
  'disabledUsers',
])

const CIDR_ARRAY_KEYS = new Set([
  'allow',
  'adminAllow',
  'guestAllow',
  'trustedProxyCidrs',
])

const VALID_MODES = new Set(['auto', 'direct', 'proxy', 'disabled'])
const VALID_TLS = new Set(['off', 'self-signed', 'files'])
const VALID_TUNNEL = new Set(['off', 'quick', 'named'])

export function validateConfigPatch(patch, effective = {}, schemaKeys = []) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { valid: false, errors: [{ key: '', error: 'Body must be a JSON object' }] }
  }

  const errors = []
  const schemaSet = new Set(schemaKeys)

  for (const [key, value] of Object.entries(patch)) {
    if (schemaSet.size > 0 && !schemaSet.has(key)) {
      errors.push({ key, error: 'Unknown config key' })
      continue
    }

    if (key === 'mode') {
      if (typeof value !== 'string' || !VALID_MODES.has(value)) {
        errors.push({ key, error: `Invalid mode '${value}', expected: auto, direct, proxy, disabled` })
      }
      continue
    }

    if (key === 'tls') {
      if (typeof value !== 'string' || !VALID_TLS.has(value)) {
        errors.push({ key, error: `Invalid tls mode '${value}', expected: off, self-signed, files` })
      }
      continue
    }

    if (key === 'tunnel') {
      if (typeof value !== 'string' || !VALID_TUNNEL.has(value)) {
        errors.push({ key, error: `Invalid tunnel mode '${value}', expected: off, quick, named` })
      }
      continue
    }

    if (key === 'directPort') {
      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        errors.push({ key, error: `Invalid port ${value}, expected integer between 1 and 65535` })
      }
      continue
    }

    if (key === 'authSessionDays') {
      if (!Number.isInteger(value) || value < 1) {
        errors.push({ key, error: `Invalid authSessionDays ${value}, expected integer >= 1` })
      }
      continue
    }

    if (key === 'streamTimeoutMs') {
      if (!Number.isInteger(value) || value < 0) {
        errors.push({ key, error: `Invalid streamTimeoutMs ${value}, expected integer >= 0` })
      }
      continue
    }

    if (BOOLEAN_KEYS.has(key)) {
      if (typeof value !== 'boolean') {
        errors.push({ key, error: `Expected boolean for '${key}', got ${typeof value}` })
      }
      continue
    }

    if (STRING_KEYS.has(key)) {
      if (typeof value !== 'string') {
        errors.push({ key, error: `Expected string for '${key}', got ${typeof value}` })
      }
      continue
    }

    if (STRING_ARRAY_KEYS.has(key)) {
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        errors.push({ key, error: `Expected array of strings for '${key}'` })
      }
      continue
    }

    if (CIDR_ARRAY_KEYS.has(key)) {
      if (!Array.isArray(value)) {
        errors.push({ key, error: `Expected array of CIDR strings for '${key}'` })
        continue
      }
      for (const item of value) {
        if (typeof item !== 'string' || parseRule(item) === null) {
          errors.push({ key, error: `Invalid CIDR or IP rule '${item}' in '${key}'` })
        }
      }
      continue
    }

    if (key === 'tlsSites') {
      if (!Array.isArray(value) || !value.every((item) => item && typeof item === 'object' && typeof item.host === 'string')) {
        errors.push({ key, error: `Expected array of TLS site objects for '${key}'` })
      }
      continue
    }
  }

  return { valid: errors.length === 0, errors }
}

export function isRestartRequired(patch, effective = {}) {
  const RESTART_KEYS = [
    'directPort',
    'directHost',
    'tls',
    'tlsDir',
    'tlsCert',
    'tlsKey',
    'tlsHosts',
    'tlsSites',
    'mode',
  ]
  for (const key of RESTART_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      if (JSON.stringify(patch[key]) !== JSON.stringify(effective[key])) {
        return true
      }
    }
  }
  return false
}

export async function persistConfigDurable(ctx, newConfig, access = {}) {
  if (typeof access?.persistConfig === 'function') {
    try {
      await access.persistConfig(newConfig)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err?.message || String(err) }
    }
  }

  const fiber = ctx?.fiber || ctx?.scope
  let persisted = false

  if (fiber?.entry?.parent?.tree && typeof fiber.entry.parent.tree.write === 'function') {
    try {
      const simplify = fiber.runtime?.Config?.['simplify']
      fiber.entry.options.config = simplify ? simplify(newConfig) : { ...newConfig }
      fiber.entry.parent.tree.write()
      persisted = true
    } catch (err) {
      return { ok: false, error: 'Loader entry tree write failed: ' + (err?.message || err) }
    }
  }

  if (!persisted && fiber && typeof fiber.update === 'function') {
    try {
      await fiber.update(newConfig, false)
      persisted = true
    } catch (err) {
      return { ok: false, error: 'Scope update failed: ' + (err?.message || err) }
    }
  }

  const loader = ctx?.get?.('loader') || ctx?.loader
  if (!persisted && loader && typeof loader.update === 'function' && fiber?.entry?.id) {
    try {
      await loader.update(fiber.entry.id, { config: { ...newConfig } })
      persisted = true
    } catch (err) {
      return { ok: false, error: 'Loader update failed: ' + (err?.message || err) }
    }
  }

  if (!persisted && typeof ctx?.emit === 'function') {
    try {
      await ctx.emit('internal/update', newConfig, false)
      persisted = true
    } catch (err) {
      return { ok: false, error: 'internal/update emit failed: ' + (err?.message || err) }
    }
  }

  if (!persisted) {
    if (process.env.NODE_ENV === 'test' || !ctx?.registry) {
      return { ok: true, standalone: true }
    }
    return { ok: false, error: 'No durable config persistence provider available' }
  }

  return { ok: true }
}

export function updateLiveState(state, config, updatedCfg) {
  Object.assign(config, updatedCfg)
  state.mode = updatedCfg.mode || state.mode
  state.rules = parseAllow(config.allow).rules
  state.adminRules = parseAllow(config.adminAllow).rules
  state.guestRules = parseAllow(config.guestAllow).rules
  state.trustedProxyCidrs = config.trustedProxyCidrs || ['127.0.0.0/8', '::1/128']
  state.unlockPrivileged = typeof config.unlockPrivileged === 'boolean' ? config.unlockPrivileged : true
  state.passwordAuth = Boolean(config.passwordAuth)
  state.authUser = config.authUser || 'admin'
  state.authPassword = config.authPassword || ''
  state.lanPin = Boolean(config.lanPin)
  state.tunnelToken = config.tunnelToken || ''
  state.publicHost = config.publicHost || ''
}
