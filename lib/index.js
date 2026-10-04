import { makeCredentialRef, resolveSecret, clearSecretCache } from './secret.js'

import z from '@deepseek-ai/schemastery'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

import { parseAllow, allowed, resolveClientRole, verifyAdminAccess, isTrustedSameOrigin } from './access.js'
import { checkAssumptions, summarize, registerAttachmentPointsVerifier } from './assumptions.js'
import { bindAddresses } from './bind.js'
import { startDirectBridge } from './bridge.js'
import { resolveBrowserAuthSecret } from './dsh-auth-cookie.js'
import { isPrivileged } from './privileged.js'
import { healthPage, hostReport } from './health.js'
import { startMdnsResponder } from './mdns.js'
import { detectMode } from './mode.js'
import { generateQRSvg, generateCachedQRSvg, generateAsciiQR } from './qr.js'
import { tokenFrom } from './handoff.js'
import { mobileStyles } from './mobile-styles.js'
import { mobileNavSource } from './mobile-nav.js'
import { ensurePortAllowed } from './firewall.js'
import { DeviceRegistry } from './devices.js'
import { CloudflareTunnel } from './tunnel.js'
import { certificateHosts, ensureCertificate, localAddresses, readCertificate, readRootCA } from './tls.js'
import { loadTlsSites } from './sni.js'
import { readBanFile, writeBanFile } from './bans.js'
import { AuthManager, makeSessionCookie, clearSessionCookie } from './auth.js'
import { registerPwaManifestRoute } from './pwa-manifest.js'
import { registerMobileQrTool } from './mobile-tool.js'
import { Config, plainConfig } from './config-schema.js'
import { registerPluginUpdater } from './plugin-updater.js'
import { registerDiagnosticsRoutes } from './routes/diagnostics.js'
import { registerDeviceRoutes } from './routes/devices.js'
import { registerTunnelRoutes } from './routes/tunnel.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerConfigApi } from './routes/config.js'
import { updateLiveState, setupDynamicConfig } from './config-validator.js'

export const name = '@goodandready/dsh-lanmode'
export const inject = {
  webServer: { required: true },
  credentials: { required: false },
}

// Config schema defined in ./config-schema.js (mode: .default('auto'), mdnsName: z, .default('dsh.local'), lanPinRef:, tunnelTokenRef:, lanPin:, tunnelToken:)
// PWA manifest registered via ./pwa-manifest.js (apple-touch-icon, shortcuts, categories, orientation)
export { Config }

const here = path.dirname(fileURLToPath(import.meta.url))

function clientPartsScript() {
  const dir = path.join(here, 'client-parts')
  const names = readdirSync(dir).filter((name) => name.endsWith('.js')).sort()
  const source = names.map((name) => readFileSync(path.join(dir, name), 'utf8')).join('\n')
  return '<script data-dsh-lanmode-parts="1">' + source.replace(/<\/script/gi, '<\\/script') + '</script>'
}

function shimSource() {
  return readFileSync(path.join(here, 'shim.js'), 'utf8')
}

const NS = 'dsh-lanmode'

function version() {
  try {
    return JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version
  } catch (unreadable) {
    return '0.6.13'
  }
}

let activeCtx = null

const say = (message) => {
  const logger = activeCtx?.logger || console
  // eslint-disable-next-line no-console
  logger.info('[dsh-lanmode] ' + message)
}

function certificateDir(config) {
  if (config.tlsDir) return config.tlsDir
  const home = process.env.DSH_HOME
  return home ? path.join(home, 'dsh-lanmode') : ''
}

export function apply(ctx, config) {
  activeCtx = ctx
  const unwrapped = plainConfig(config)
  let effective = Object.assign({}, unwrapped)
  let configSource = (config && Object.keys(config).length > 0) ? 'row' : 'defaults'
  let configWarning = ''
  let onConfigUpdated = null

  // DSH 0.1.7+: config comes directly from profile row via apply(ctx, config).
  // No settings.register — the service was removed in DSH 0.1.7.
  if (configSource === 'defaults') {
    say('no profile config found, running with schema defaults (mode: ' + (effective.mode || 'auto') + ')')
  } else {
    say('config loaded from profile row (mode: ' + (effective.mode || 'auto') + ')')
  }

  // Fail-closed guard: refuse to start on 0.0.0.0 without allow list or password.
  if (effective.mode === 'direct' || effective.mode === 'auto') {
    const host = effective.directHost || '0.0.0.0'
    const isWild = host === '0.0.0.0' || host === '::' || host === ''
    const hasAllow = Array.isArray(effective.allow) && effective.allow.length > 0
    const hasPassword = !!effective.passwordAuth
    if (isWild && !hasAllow && !hasPassword) {
      configWarning = 'Refusing to bind 0.0.0.0 without allow list or passwordAuth — '
        + 'configure allow or passwordAuth, or set directHost to 127.0.0.1'
      say('SECURITY: ' + configWarning)
    }
  }

  const handle = start(ctx, effective, { configSource, configWarning })
  if (handle && typeof handle.onConfigUpdated === 'function') {
    onConfigUpdated = handle.onConfigUpdated
  }

  // Register dynamic config reload on settings/volatile updates (#394)
  setupDynamicConfig(ctx, {
    effective,
    onConfigUpdated,
    log: say,
  })

  // Register config HTTP API for client-side settings card.
  registerConfigApi(ctx, effective, onConfigUpdated, {
    state: handle && handle.state,
  })
}

export { makeCredentialRef, resolveSecret, clearSecretCache } from './secret.js'

/** Start direct mode listener. */
async function raiseListener(ctx, config, state) {
  const unwrapped = plainConfig(config)
  const port = unwrapped.directPort || 3088
  const { hosts, shared } = bindAddresses(unwrapped, ctx.webServer && ctx.webServer.port)
  if (shared) {
    say('port ' + port + ' is bound to loopback by harness; listening on: ' + hosts.join(', '))
  }
  const { rules, dropped } = parseAllow(unwrapped.allow)
  if (dropped.length) say('unparsed allow entries: ' + dropped.join(', '))

  let tls = null
  if (unwrapped.tls === 'files') {
    try {
      tls = readCertificate(unwrapped.tlsCert, unwrapped.tlsKey)
      state.tls = { enabled: true, source: 'custom certificate', fingerprint: tls.fingerprint }
      state.caCertPath = unwrapped.tlsCert || null
    } catch (unreadable) {
      say('certificate read error (' + String(unreadable.message || unreadable) + ') — starting without TLS, microphone will be disabled')
    }
  } else if (unwrapped.tls === 'self-signed') {
    const dir = certificateDir(unwrapped)
    if (!dir) {
      say('no directory to store certificates: specify tlsDir — starting without TLS')
    } else {
      try {
        const mdnsHost = state.mdnsName || 'dsh.local'
        const certHosts = [...new Set([...(unwrapped.tlsHosts ?? []), ...certificateHosts(mdnsHost)])]
        const made = await ensureCertificate({ dir, hosts: certHosts, log: say })
        tls = made
        state.tls = { enabled: true, source: 'Root CA + server cert', fingerprint: made.fingerprint }
        state.caAvailable = Boolean(made.caCert)
        state.caCertPath = made.caCertPath || null
        say((made.issued ? 'issued' : 'loaded') + ' certificate for ' + certHosts.length + ' names (including ' + mdnsHost + '), fingerprint ' + made.fingerprint)
        if (made.caCert) {
          say('Root CA available for download at: /dsh-lanmode/ca.crt')
        }
      } catch (failed) {
        say('certificate generation failed (' + String(failed.message || failed) + '). Starting without TLS, microphone will be disabled')
      }
    }
  }

  const unlocked = unwrapped.unlockPrivileged !== false
  const rawLanPin = unwrapped.lanPin ? String(unwrapped.lanPin).trim() : ''
  const resolvedLanPin = await resolveSecret(ctx, unwrapped.lanPinRef, rawLanPin)
  const lanPin = resolvedLanPin ? String(resolvedLanPin).trim() : ''
  if (unlocked) {
    if (lanPin) {
      say('privileged calls are protected with LAN PIN.')
    } else {
      say('WARNING: privileged calls exposed to network without PIN (configure lanPin or lanPinRef to secure).')
    }
    if (rules.length === 0 && !unwrapped.passwordAuth) {
      say('SECURITY WARNING: LAN bridge listening without password authentication or IP restrictions.')
    }
  }

  if (tls) tls.sites = loadTlsSites(unwrapped.tlsSites, say)

  state.listener = { scheme: tls ? 'https' : 'http', hosts, port }
  state.unlockPrivileged = unlocked
  state.lanPin = Boolean(lanPin)

  // Gate ASCII QR in server journal by DEBUG flag (#333)
  if (process.env.DEBUG || process.env.DSH_LANMODE_DEBUG_QR) {
    try {
      const primaryUrl = `${state.listener.scheme}://${state.mdnsName || 'dsh.local'}:${port}/`
      say('QR code for smartphone quick login:' + generateAsciiQR(primaryUrl))
    } catch (err) {
      if (ctx?.logger && typeof ctx.logger.debug === 'function') {
        ctx.logger.debug(`[dsh-lanmode] failed to render console QR: ${err?.message || err}`)
      }
    }
  }

  // #59, #60: Automatic host firewall port management
  try {
    ensurePortAllowed(port).then((fw) => {
      if (fw.managed && fw.detail) say('Firewall: ' + fw.detail)
    }).catch((err) => {
      if (ctx?.logger && typeof ctx.logger.debug === 'function') {
        ctx.logger.debug(`[dsh-lanmode] firewall setup error: ${err?.message || err}`)
      }
    })
  } catch (err) {
    if (ctx?.logger && typeof ctx.logger.debug === 'function') {
      ctx.logger.debug(`[dsh-lanmode] firewall check skipped: ${err?.message || err}`)
    }
  }

  return startDirectBridge(ctx, {
    state,
    browserAuthSecret: state.browserAuthSecret || (await resolveBrowserAuthSecret(ctx)),
    hosts,
    port,
    log: say,
    allow: rules,
    adminAllow: unwrapped.adminAllow,
    trustedProxyCidrs: unwrapped.trustedProxyCidrs, guestAllow: unwrapped.guestAllow,
    guestDenyExtra: unwrapped.guestDenyExtra, tls, unlockPrivileged: unlocked, lanPin,
    privilegedExtra: unwrapped.privilegedExtra, streamTimeoutMs: unwrapped.streamTimeoutMs || 0,
    autoAuth: unwrapped.autoAuth !== false, deviceRegistry: state.deviceRegistry,
    tunnelPin: unwrapped.tunnelPin !== false,
    get passwordAuth() { return Boolean(config.passwordAuth ?? state.passwordAuth) },
    get authUser() { return config.authUser || state.authUser || 'admin' },
    get publicHost() { return config.publicHost || state.publicHost || '' },
    authManager: state.authManager, adaptiveCompression: unwrapped.adaptiveCompression !== false,
    dshAuthCookie: () => state.dshAuthCookie || '', version: state.version, banList: state.banList,
    persistBans: () => writeBanFile(state.banFile, state.banList),
  })
}

function start(ctx, config, meta = {}) {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const deviceRegistry = new DeviceRegistry(path.join(dshHome, 'dsh-lanmode-devices.json'))
  const banFile = path.join(dshHome, 'dsh-lanmode-bans.json')
  const banList = readBanFile(banFile)
  ctx.effect(() => () => deviceRegistry.flush(), 'dsh-lanmode: flush device registry to disk')
  const authManager = new AuthManager({
    deviceRegistry,
    sessionDurationMs: (config.authSessionDays || 30) * 24 * 60 * 60 * 1000,
  })
  ctx.effect(() => () => authManager.destroy(), 'dsh-lanmode: clean up authManager timers')
  const sweepTimer = setInterval(() => {
    try { authManager.sweepDisabled(config.disabledUsers) } catch { /* ignore a bad list */ }
  }, 5000)
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref()
  ctx.effect(() => () => clearInterval(sweepTimer), 'dsh-lanmode: sweep disabled sessions')
  ctx.effect(() => () => clearSecretCache(), 'dsh-lanmode: clear secret cache on dispose')
  const tunnel = new CloudflareTunnel({
    token: config.tunnelToken,
    mode: config.tunnel || 'quick',
    log: say,
  })
  tunnel.on('error', (err) => {
    say('[dsh-lanmode:tunnel] ' + (err?.message || err))
  })
  // WAN tunnel auto-start and lifecycle management (#48)
  ctx.effect(() => {
    let alive = true
    if (config.tunnel && config.tunnel !== 'off') {
      const mode = config.tunnel
      resolveSecret(ctx, config.tunnelTokenRef, config.tunnelToken).then((token) => {
        if (!alive) return
        const port = state.listener ? state.listener.port : (ctx.webServer?.port || 3088)
        const scheme = state.listener ? state.listener.scheme : 'http'
        const originServerName = state.mdnsName || 'dsh.local'
        const caPool = state.caCertPath || null
        tunnel.start({ port, scheme, originServerName, caPool, mode, token }).catch((err) => {
          say('[dsh-lanmode:tunnel] Auto-start failed: ' + (err?.message || err))
        })
      }).catch((err) => {
        say('[dsh-lanmode:tunnel] Secret resolution failed: ' + (err?.message || err))
      })
    }
    return () => { alive = false; tunnel.stop() }
  }, 'dsh-lanmode: WAN tunnel lifecycle')
  const pieces = {
    settings: config.settings !== false, randomUuid: config.randomUuid !== false,
    clipboard: config.clipboard !== false, mobileEnterSends: config.mobileEnterSends === true,
    get passwordAuth() { return Boolean(config.passwordAuth) },
    set passwordAuth(v) { config.passwordAuth = Boolean(v) },
    get authUser() { return config.authUser || 'admin' },
    set authUser(v) { config.authUser = v || 'admin' },
    get publicHost() { return config.publicHost || '' },
    set publicHost(v) { config.publicHost = v || '' },
  }

  let mdnsName = (typeof config.mdnsName === 'string' && config.mdnsName.trim().toLowerCase()) || 'dsh.local'
  if (!mdnsName.endsWith('.local')) {
    say(`[dsh-lanmode] Warning: mDNS name "${mdnsName}" must end in .local. Appended: "${mdnsName}.local"`)
    mdnsName = `${mdnsName}.local`
  }

  const state = {
    version: version(),
    configSource: meta.configSource || 'defaults',
    configWarning: meta.configWarning || '',
    mode: config.mode,
    modeReason: '',
    listener: null,
    caCertPath: null,
    unlockPrivileged: null,
    lanPin: Boolean(config.lanPin),
    get passwordAuth() { return Boolean(config.passwordAuth) },
    set passwordAuth(v) { config.passwordAuth = Boolean(v) },
    get authUser() { return config.authUser || 'admin' },
    set authUser(v) { config.authUser = v || 'admin' },
    get publicHost() { return config.publicHost || '' },
    set publicHost(v) { config.publicHost = v || '' },
    authManager,
    deviceRegistry,
    banFile,
    banList,
    tunnel,
    tls: { enabled: false },
    caAvailable: false,
    mdns: false,
    mdnsName,
    pieces,
    allow: Array.isArray(config.allow) ? config.allow : [],
    rules: parseAllow(config.allow).rules,
    adminRules: parseAllow(config.adminAllow).rules,
    guestRules: parseAllow(config.guestAllow).rules,
    assumptions: [],
  }

  // Start mDNS responder for mdnsName (#78)
  if (config.mdns !== false) {
    ctx.effect(() => {
      let addresses = localAddresses(mdnsName).filter((a) =>
        a !== 'localhost' && a !== mdnsName && !a.endsWith('.local') && !/^127\./.test(a) && a !== '::1'
      )
      // Filter network addresses through allowlist (#78)
      if (Array.isArray(config.allow) && config.allow.length > 0) {
        const { rules } = parseAllow(config.allow)
        addresses = addresses.filter((addr) => allowed(addr, rules))
      }
      if (addresses.length === 0) {
        say(`[dsh-lanmode] mDNS: all local addresses excluded by allow list (${config.allow.join(', ')}) — ${mdnsName} announcement skipped`)
        state.mdns = false
        return
      }
      const stopMdns = startMdnsResponder({ name: mdnsName, port: config.directPort || 3088, addresses, log: say })
      state.mdns = true
      return () => { state.mdns = false; stopMdns() }
    }, 'dsh-lanmode: mDNS responder (' + mdnsName + ')')
  }

  // Listener mode and lifecycle management
  let currentStop = () => {}
  let listenerAlive = true
  let activeDirectConfigKey = ''

  const syncListener = async (cfg) => {
    if (!listenerAlive) return
    let mode = cfg.mode || 'auto'
    if (mode === 'auto') {
      const verdict = await detectMode({
        addresses: localAddresses(),
        port: ctx.webServer && ctx.webServer.port,
        directPort: cfg.directPort || 3088,
      })
      mode = verdict.mode
      state.mode = mode
      state.modeReason = verdict.reason
      say('auto mode selected: ' + mode + ' — ' + verdict.reason)
    } else {
      state.mode = mode
      state.modeReason = 'configured in settings'
    }

    if (mode !== 'direct') {
      if (currentStop) {
        const stopFn = currentStop
        currentStop = () => {}
        state.listener = null
        activeDirectConfigKey = ''
        await Promise.resolve(stopFn())
      }
      return
    }

    // Fail-closed guard: refuse to bind 0.0.0.0 / :: without allow list or passwordAuth (#360)
    const host = cfg.directHost || '0.0.0.0'
    const isWild = host === '0.0.0.0' || host === '::' || host === ''
    const { rules } = parseAllow(cfg.allow)
    const hasAllow = rules.length > 0
    const hasPassword = Boolean(cfg.passwordAuth)
    if (isWild && !hasAllow && !hasPassword) {
      if (currentStop) {
        const stopFn = currentStop
        currentStop = () => {}
        state.listener = null
        activeDirectConfigKey = ''
        await Promise.resolve(stopFn())
      }
      state.listener = null
      state.modeReason = 'Refused to bind ' + (host || '0.0.0.0') + ' without allow list or passwordAuth (fail-closed guard)'
      say('SECURITY: Refusing to bind ' + (host || '0.0.0.0') + ' without allow list or passwordAuth — configure allow or passwordAuth, or set directHost to 127.0.0.1')
      return
    }

    let certFingerprint = ''
    if (cfg.tls === 'files' && cfg.tlsCert && existsSync(cfg.tlsCert)) {
      try {
        const stat = statSync(cfg.tlsCert)
        certFingerprint = `${stat.mtimeMs}:${stat.size}`
      } catch (_) {}
    }

    const directKey = JSON.stringify({
      mode,
      host: cfg.directHost || '0.0.0.0',
      port: cfg.directPort || 3088,
      tls: cfg.tls,
      tlsCert: cfg.tlsCert,
      tlsKey: cfg.tlsKey,
      certFingerprint,
      tlsHosts: cfg.tlsHosts,
      tlsSites: cfg.tlsSites,
      tlsDir: cfg.tlsDir,
    })

    if (activeDirectConfigKey === directKey && state.listener) {
      return
    }

    if (currentStop) {
      const stopFn = currentStop
      currentStop = () => {}
      state.listener = null
      await Promise.resolve(stopFn())
    }

    if (!listenerAlive) return
    currentStop = await raiseListener(ctx, cfg, state)
    activeDirectConfigKey = directKey
  }

  ctx.effect(() => {
    listenerAlive = true
    let retryTimer = null
    let retryDelay = 1000
    const maxRetryDelay = 30000

    const attemptSync = () => {
      if (!listenerAlive) return
      syncListener(config).catch((failed) => {
        const stackMsg = failed?.stack || failed?.message || String(failed)
        say('direct listener failed to start: ' + stackMsg)
        if (listenerAlive) {
          retryTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, maxRetryDelay)
            attemptSync()
          }, retryDelay)
          if (retryTimer.unref) retryTimer.unref()
        }
      })
    }

    attemptSync()

    return () => {
      listenerAlive = false
      if (retryTimer) clearTimeout(retryTimer)
      if (currentStop) {
        currentStop()
        currentStop = () => {}
      }
      state.listener = null
      activeDirectConfigKey = ''
    }
  }, 'dsh-lanmode: direct bridge listener')

  // Verify attachment points
  registerAttachmentPointsVerifier(ctx, state, say)

  // Register agent tool / command /mobileqr
  registerMobileQrTool(ctx, state)

  // Diagnostic routes, PWA manifest, CA cert, profiles and QR
  if (config.diagnostics !== false) {
    registerPwaManifestRoute(ctx)

    registerDiagnosticsRoutes(ctx, {
      state, config, certificateDir, readRootCA, hostReport, healthPage, generateCachedQRSvg,
      routes: { health: '/dsh-lanmode/health', caCert: '/dsh-lanmode/ca.crt', manifest: '/dsh-lanmode/manifest.json', qr: '/dsh-lanmode/qr', probe: '/dsh-lanmode/probe' /* probeResult */ },
    })
    registerDeviceRoutes(ctx, {
      state, config, deviceRegistry, resolveClientRole, verifyAdminAccess, isTrustedSameOrigin,
      routes: { devices: '/dsh-lanmode/devices', revoke: '/dsh-lanmode/devices/revoke', killAll: '/dsh-lanmode/devices/kill-all', nickname: '/dsh-lanmode/devices/nickname' },
    })
    registerAuthRoutes(ctx, {
      state, config, authManager, resolveSecret, makeSessionCookie, clearSessionCookie, isTrustedSameOrigin,
      routes: { login: '/dsh-lanmode/auth/login', logout: '/dsh-lanmode/auth/logout', session: '/dsh-lanmode/auth/session' },
    })
    registerTunnelRoutes(ctx, {
      state, config, tunnel, resolveSecret, resolveClientRole, verifyAdminAccess, isTrustedSameOrigin,
      routes: { status: '/dsh-lanmode/tunnel', toggle: '/dsh-lanmode/tunnel/toggle' },
    })
  }

  // PWA meta tags and polyfills injection into index.html
  const pwaMeta = (config.pwa !== false)
    ? '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="theme-color" content="#1e1e2e"><link rel="apple-touch-icon" href="/favicon.ico"><link rel="manifest" href="/dsh-lanmode/manifest.json">'
    : ''
  const script = '<script data-dsh-lanmode="1">window.__DSH_LANMODE__=' + JSON.stringify(pieces) + ';' + shimSource() + '</script>'
  const navScript = '<script data-dsh-lanmode-nav="1">' + mobileNavSource() + '</script>'

  ctx.effect(() => ctx.webServer.tapIndex((html) => {
    if (html.includes('data-dsh-lanmode')) return html
    const insert = clientPartsScript() + pwaMeta + mobileStyles() + script + navScript
    const match = html.match(/<head[^>]*>/i)
    if (!match) return insert + html
    const at = match.index + match[0].length
    return html.slice(0, at) + insert + html.slice(at)
  }), 'dsh-lanmode: inject shim and PWA in index.html')

  // One-click plugin updater (#134)
  ctx.effect(() => registerPluginUpdater(ctx, {
    packageName: '@goodandready/dsh-lanmode',
    endpoint: '/api/dsh-lanmode/update',
    manifestUrl: new URL('../package.json', import.meta.url),
    state,
    config,
    resolveClientRole: (ip, rules) => resolveClientRole(ip, rules ?? {
      adminRules: state.adminRules,
      guestRules: state.guestRules,
      defaultRules: state.rules,
    }),
  }), 'dsh-lanmode: one-click plugin updater')

  return {
    state,
    onConfigUpdated: (updatedCfg) => {
      updateLiveState(state, config, updatedCfg)
      if (typeof syncListener === 'function') {
        syncListener(config).catch((err) => say('error applying new settings: ' + String(err.message || err)))
      }
      if (updatedCfg.tunnel === 'off' && tunnel.status !== 'stopped') {
        tunnel.stop()
      } else if (updatedCfg.tunnel && updatedCfg.tunnel !== 'off' && tunnel.status === 'stopped') {
        resolveSecret(ctx, config.tunnelTokenRef, config.tunnelToken).then((token) => {
          const port = state.listener ? state.listener.port : (ctx.webServer?.port || 3088)
          const scheme = state.listener ? state.listener.scheme : 'http'
          const originServerName = state.mdnsName || 'dsh.local'
          const caPool = state.caCertPath || null
          tunnel.start({ port, scheme, originServerName, caPool, mode: updatedCfg.tunnel, token }).catch(() => {})
        }).catch(() => {})
      }
    },
  }
}
