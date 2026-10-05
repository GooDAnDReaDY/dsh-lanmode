// dsh-lanmode — Host-side one-click plugin updater.
// Unified DSH plugin updater standard for @goodandready/dsh-lanmode.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isTrustedSameOrigin, verifyAdminAccess } from './access.js'
import { verifyLanPin, recordPinAttempt, checkPinRateLimit, PIN_REQUIRED } from './privileged.js'
import { readLimitedBody, rejectTooLarge } from './body-limit.js'
import { resolveSecret } from './secret.js'

export function isPidAlive(pid) {
  if (!pid || !Number.isInteger(Number(pid))) return false
  try {
    process.kill(Number(pid), 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

export function checkProfileLock(profileDir) {
  if (!profileDir) return { locked: false }
  const lockPath = resolve(profileDir, 'package.json.lock')
  if (!existsSync(lockPath)) return { locked: false }
  try {
    const raw = readFileSync(lockPath, 'utf8').trim()
    let pid = null
    try {
      const parsed = JSON.parse(raw)
      pid = parsed?.pid ?? parsed
    } catch (_) {
      pid = parseInt(raw, 10)
    }
    const numPid = Number.isInteger(Number(pid)) ? Number(pid) : null
    return { locked: true, pid: numPid }
  } catch (_) {
    return { locked: true, pid: null }
  }
}

const UPDATE_HEADER = 'x-dsh-plugin-update'
const UPDATE_TIMEOUT_MS = 10 * 60_000
const VERSION_CACHE_MS = 5 * 60_000
let latestCache = undefined

function header(request, name) {
  const value = request?.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

export function isTrustedUpdateRequest(request, { state, config, clientIp, role } = {}) {
  if (header(request, UPDATE_HEADER) !== '1') return false
  if (!isTrustedSameOrigin(request)) return false

  const remoteIp = clientIp || request?.socket?.remoteAddress || ''
  const auth = verifyAdminAccess(request, {
    state,
    config,
    clientIp: remoteIp,
    role,
  })
  return auth.ok === true
}

function validProfileName(value) {
  return (
    typeof value === 'string' &&
    value !== '' &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !/[\0-\x1f\x7f]/.test(value)
  )
}

function profileNameFromArgv(argv) {
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--profile') return argv[index + 1]
    if (argv[index]?.startsWith('--profile=')) return argv[index].slice('--profile='.length)
  }
  return argv[2] === 'web' ? 'web' : undefined
}

function findDshCliEntry() {
  const value = process.argv[1]
  if (value === undefined || value === '') return undefined
  const entry = value.startsWith('file:') ? fileURLToPath(value) : resolve(process.cwd(), value)
  if (!existsSync(entry)) return undefined
  for (let directory = dirname(entry); ; directory = dirname(directory)) {
    const manifestPath = resolve(directory, 'package.json')
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        const bin =
          typeof manifest.bin === 'string'
            ? manifest.bin
            : typeof manifest.bin === 'object' && manifest.bin !== null
            ? manifest.bin.dsh
            : undefined
        if (
          manifest.name === '@deepseek-ai/dsh' &&
          typeof bin === 'string' &&
          !isAbsolute(bin) &&
          resolve(directory, bin) === resolve(entry)
        ) {
          return entry
        }
      } catch {
        // Continue searching parent directories
      }
    }
    const parent = dirname(directory)
    if (parent === directory) return undefined
  }
}

function runtime() {
  const profileDir = resolve(
    process.env.DSH_PROFILE_DIR ?? resolve(homedir(), '.dsh', 'profiles', 'web')
  )
  const selected = profileNameFromArgv(process.argv)
  const profileName = validProfileName(selected)
    ? selected
    : validProfileName(basename(profileDir))
    ? basename(profileDir)
    : 'web'
  const cliEntry = findDshCliEntry()
  return cliEntry === undefined ? { profileName, profileDir } : { profileName, profileDir, cliEntry }
}

export function parseSemver(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value)
  if (match === null) return undefined
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split('.') ?? [],
  }
}

export function comparePrerelease(left, right) {
  if (left.length === 0 || right.length === 0) {
    return left.length === right.length ? 0 : left.length === 0 ? 1 : -1
  }
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? -1 : 1
    if (a === b) continue
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) {
      const aNumber = BigInt(a)
      const bNumber = BigInt(b)
      if (aNumber !== bNumber) return aNumber > bNumber ? 1 : -1
      continue
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
    return a > b ? 1 : -1
  }
  return 0
}

export function isNewerVersion(currentValue, candidateValue) {
  const current = parseSemver(currentValue)
  const candidate = parseSemver(candidateValue)
  if (current === undefined || candidate === undefined) return false
  for (let index = 0; index < 3; index += 1) {
    if (candidate.core[index] !== current.core[index]) {
      return candidate.core[index] > current.core[index]
    }
  }
  return comparePrerelease(candidate.prerelease, current.prerelease) > 0
}

async function latestVersion(packageName, registry) {
  if (
    latestCache?.packageName === packageName &&
    latestCache.registry === registry &&
    Date.now() < latestCache.expiresAt
  ) {
    return latestCache.version
  }
  try {
    const response = await fetch(
      `${registry.replace(/\/$/, '')}/${encodeURIComponent(packageName)}/latest`,
      { signal: AbortSignal.timeout(8_000) }
    )
    if (!response.ok) return undefined
    const value = await response.json()
    if (typeof value.version !== 'string' || value.version === '') return undefined
    latestCache = {
      packageName,
      registry,
      version: value.version,
      expiresAt: Date.now() + VERSION_CACHE_MS,
    }
    return value.version
  } catch {
    return undefined
  }
}

async function currentVersion(manifestUrl) {
  const value = JSON.parse(await readFile(manifestUrl, 'utf8'))
  if (typeof value.version !== 'string' || value.version === '') {
    throw new Error('Cannot read current plugin version.')
  }
  return value.version
}

export async function status(options, target = {}) {
  const current = await currentVersion(options?.manifestUrl)
  const latest = await latestVersion(options?.packageName, options?.registry ?? 'https://registry.npmjs.org')
  return {
    name: options?.packageName,
    packageName: options?.packageName,
    currentVersion: current,
    checkedAt: Date.now(),
    ...(latest === undefined ? {} : { latestVersion: latest }),
    latestCheckFailed: latest === undefined,
    updateAvailable: latest !== undefined && isNewerVersion(current, latest),
    profileName: target?.profileName,
    canAutoUpdate: target?.cliEntry !== undefined,
  }
}

async function installExact(target, packageSpec, options) {
  if (target.cliEntry === undefined) {
    throw new Error('Automatic update is unavailable in this runtime.')
  }
  await new Promise((resolvePromise, reject) => {
    // Note: Respect strict supply-chain quarantine without release age bypass per #214 / #426
    const child = spawn(
      process.execPath,
      [
        target.cliEntry,
        'plugin',
        '--profile',
        target.profileName,
        'add',
        packageSpec,
        `--registry=${options.registry ?? 'https://registry.npmjs.org/'}`,
      ],
      {
        cwd: target.profileDir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1' },
      }
    )
    let detail = ''
    child.stdout?.on('data', (chunk) => {
      detail = (detail + String(chunk)).slice(-4_000)
    })
    child.stderr?.on('data', (chunk) => {
      detail = (detail + String(chunk)).slice(-4_000)
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL')
      }, 500).unref?.()
      reject(new Error('Update timed out; use the normal DSH update flow.'))
    }, UPDATE_TIMEOUT_MS)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolvePromise()
      else reject(new Error(detail.trim() || `Update exited with code ${String(code)}.`))
    })
  })
}

function json(response, statusCode, value) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

export function registerPluginUpdater(ctx, options) {
  const host = ctx
  let ws = null
  try {
    ws = host?.webServer
  } catch (err) {
    if (ctx?.logger?.debug) {
      ctx.logger.debug(`[dsh-lanmode:updater] webServer inspection failed: ${err?.message || err}`)
    }
    ws = null
  }
  if (!ws || typeof ws.register !== 'function') {
    return () => {}
  }
  let installing = false
  return ws.register({
    kind: 'exact',
    path: options.endpoint,
    handler: async (request, response) => {
      try {
        const target = runtime()
        if (request.method === 'GET' || request.method === 'HEAD') {
          const payload = await status(options, target)
          response.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          })
          response.end(request.method === 'HEAD' ? undefined : JSON.stringify(payload))
          return
        }
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'GET, HEAD, POST' })
          response.end()
          return
        }

        const clientIp = request.socket?.remoteAddress || ''
        const accessRules = {
          adminRules: options.state?.adminRules,
          guestRules: options.state?.guestRules,
          defaultRules: options.state?.rules,
        }
        const role = typeof options.resolveClientRole === 'function'
          ? options.resolveClientRole(clientIp, accessRules)
          : undefined
        const authContext = {
          state: options.state,
          config: options.config,
          clientIp,
          role,
        }

        if (!isTrustedUpdateRequest(request, authContext)) {
          json(response, 403, { error: 'Rejected non-local, unauthenticated, or cross-origin update request.' })
          return
        }
        // Issue #361: Dynamic PIN resolution
        const configuredPinRef = options.config?.lanPinRef || options.state?.config?.lanPinRef
        let currentPin = options.config?.lanPin || ''
        if (configuredPinRef) {
          try {
            const res = await resolveSecret(ctx, configuredPinRef, options.config?.lanPin || '')
            if (res) currentPin = String(res).trim()
          } catch (_) {}
        } else if (!currentPin && options.state?.lanPinValue) {
          currentPin = options.state.lanPinValue
        }
        if (currentPin && options.state) {
          options.state.lanPinValue = currentPin
          options.state.lanPin = Boolean(currentPin)
        }
        if (configuredPinRef && !currentPin) {
          response.writeHead(503, {
            'content-type': 'application/json; charset=utf-8',
            'x-dsh-lan-pin-required': '1',
          })
          response.end(JSON.stringify({ error: 'LAN PIN reference configured but cannot be resolved' }))
          return
        }
        if (currentPin) {
          const limit = checkPinRateLimit(clientIp)
          if (!limit.allowed) {
            const retrySec = Math.ceil(limit.remainingMs / 1000)
            response.writeHead(429, {
              'content-type': 'application/json; charset=utf-8',
              'retry-after': String(retrySec),
              'x-dsh-lan-pin-retry-after': String(retrySec),
            })
            response.end(JSON.stringify({ error: 'Too many failed PIN attempts. Please retry in ' + retrySec + 's.' }))
            return
          }
          const valid = verifyLanPin(request.headers, currentPin)
          recordPinAttempt(clientIp, valid)
          if (!valid) {
            json(response, 403, { error: PIN_REQUIRED })
            return
          }
        }
        let action = 'update'
        if (typeof request.on === 'function') {
          const limited = await readLimitedBody(request)
          if (!limited.ok) {
            rejectTooLarge(response, request)
            return
          }
          if (limited.text && limited.text.trim()) {
            try {
              const parsed = JSON.parse(limited.text)
              if (parsed && typeof parsed.action === 'string') {
                action = parsed.action
              }
            } catch (_) {
              // fallback
            }
          }
        } else if (request.body && typeof request.body === 'object' && request.body.action) {
          action = request.body.action
        }

        if (action === 'check') {
          const currentStatus = await status(options, target)
          json(response, 200, {
            ...currentStatus,
            success: true,
          })
          return
        }

        if (action !== 'update') {
          json(response, 400, { error: `Unsupported updater action: ${action}` })
          return
        }

        if (installing) {
          json(response, 409, { error: 'This plugin is already updating.' })
          return
        }
        const lock = checkProfileLock(target.profileDir)
        if (lock.locked) {
          json(response, 409, { error: `Another package installation is in progress (PID ${lock.pid}).` })
          return
        }
        installing = true
        try {
          const before = await status(options, target)
          if (before.latestVersion === undefined) {
            json(response, 503, { error: 'The latest version is temporarily unavailable.' })
            return
          }
          if (!before.updateAvailable) {
            json(response, 200, {
              ...before,
              success: true,
            })
            return
          }
          await installExact(target, `${options.packageName}@${before.latestVersion}`, options)
          json(response, 200, {
            ...before,
            success: true,
            updatedVersion: before.latestVersion,
            restartRequired: true,
          })
        } finally {
          installing = false
        }
      } catch (error) {
        if (ctx.logger && typeof ctx.logger.warn === 'function') {
          ctx.logger.warn(`[dsh-lanmode] plugin updater failed: ${String(error)}`)
        }
        json(response, 503, { error: 'Plugin update failed; see server logs.' })
      }
    },
  })
}
