import crypto from 'node:crypto'
import { makeCredentialRef, resolveSecret } from './secret.js'
// dsh-lanmode — Host core.
//
// The plugin enables features restricted by Web UI on non-localhost origins:
// 1. Settings and models (unblock loopback restrictions).
// 2. crypto.randomUUID and navigator.clipboard (HTTP polyfills).
// 3. mDNS announcement (dsh.local), automatic Root CA and server certificates for microphone.
// 4. Direct Bridge with WebSocket, streaming, role separation, and token handoff.
// 5. PWA Manifest and mobile viewport.
// 6. Smartphone quick access helper tool /mobileqr.

import z from '@deepseek-ai/schemastery'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

import { parseAllow, allowed, resolveClientRole, verifyAdminAccess, isTrustedSameOrigin } from './access.js'
import { checkAssumptions, summarize } from './assumptions.js'
import { bindAddresses } from './bind.js'
import { startDirectBridge } from './bridge.js'
import { resolveBrowserAuthSecret, mintDshAuthCookie, mintCoreAuthCookie } from './dsh-auth-cookie.js'
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
import { Config } from './config-schema.js'
import { registerPluginUpdater } from './plugin-updater.js'
import { registerDiagnosticsRoutes } from './routes/diagnostics.js'
import { registerDeviceRoutes } from './routes/devices.js'
import { registerTunnelRoutes } from './routes/tunnel.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerConfigApi } from './routes/config.js'

export const name = '@goodandready/dsh-lanmode'
export const inject = ['webServer']

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
  let effective = Object.assign({}, config)
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

  // Register config HTTP API for client-side settings card.
  registerConfigApi(ctx, effective, onConfigUpdated, {
    state: handle && handle.state,
  })
}


export { makeCredentialRef, resolveSecret } from './secret.js'

/** Start direct mode listener. */
async function raiseListener(ctx, config, state) {
  const port = config.directPort || 3088
  const { hosts, shared } = bindAddresses(config, ctx.webServer && ctx.webServer.port)
  if (shared) {
    say('port ' + port + ' is bound to loopback by harness; listening on: ' + hosts.join(', '))
  }
  const { rules, dropped } = parseAllow(config.allow)
  if (dropped.length) say('unparsed allow entries: ' + dropped.join(', '))

  let tls = null
  if (config.tls === 'files') {
    try {
      tls = readCertificate(config.tlsCert, config.tlsKey)
      state.tls = { enabled: true, source: 'custom certificate', fingerprint: tls.fingerprint }
    } catch (unreadable) {
      say('certificate read error (' + String(unreadable.message || unreadable) + ') — starting without TLS, microphone will be disabled')
    }
  } else if (config.tls === 'self-signed') {
    const dir = certificateDir(config)
    if (!dir) {
      say('no directory to store certificates: specify tlsDir — starting without TLS')
    } else {
      try {
        const mdnsHost = state.mdnsName || 'dsh.local'
        const certHosts = [...new Set([...(config.tlsHosts ?? []), ...certificateHosts(mdnsHost)])]
        const made = await ensureCertificate({ dir, hosts: certHosts, log: say })
        tls = made
        state.tls = { enabled: true, source: 'Root CA + server cert', fingerprint: made.fingerprint }
        state.caAvailable = Boolean(made.caCert)
        say((made.issued ? 'issued' : 'loaded') + ' certificate for ' + certHosts.length + ' names (including ' + mdnsHost + '), fingerprint ' + made.fingerprint)
        if (made.caCert) {
          say('Root CA available for download at: /dsh-lanmode/ca.crt')
        }
      } catch (failed) {
        say('certificate generation failed (' + String(failed.message || failed) + '). Starting without TLS, microphone will be disabled')
      }
    }
  }

  const unlocked = config.unlockPrivileged !== false
  const rawLanPin = config.lanPin ? String(config.lanPin).trim() : ''
  const resolvedLanPin = await resolveSecret(ctx, config.lanPinRef, rawLanPin)
  const lanPin = resolvedLanPin ? String(resolvedLanPin).trim() : ''
  if (unlocked) {
    if (lanPin) {
      say('privileged calls are protected with LAN PIN.')
    } else {
      say('WARNING: privileged calls are exposed to network without PIN.')
    }
    if (rules.length === 0) {
      say('allowlist is empty (access permitted for all subnet addresses).')
      if (!config.passwordAuth) {
        say('SECURITY WARNING: LAN bridge is listening without password authentication or IP restrictions.')
      }
    }
  }

  if (tls) tls.sites = loadTlsSites(config.tlsSites, say)

  state.listener = { scheme: tls ? 'https' : 'http', hosts, port }
  state.unlockPrivileged = unlocked
  state.lanPin = Boolean(lanPin)

  try {
    const primaryUrl = `${state.listener.scheme}://${state.mdnsName || 'dsh.local'}:${port}/`
    say('QR code for smartphone quick login:' + generateAsciiQR(primaryUrl))
  } catch (err) {
    if (ctx?.logger && typeof ctx.logger.debug === 'function') {
      ctx.logger.debug(`[dsh-lanmode] failed to render console QR: ${err?.message || err}`)
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
    browserAuthSecret: state.browserAuthSecret || resolveBrowserAuthSecret(ctx),
    hosts,
    port,
    log: say,
    allow: rules,
    adminAllow: config.adminAllow,
    trustedProxyCidrs: config.trustedProxyCidrs,
    guestAllow: config.guestAllow,
    tls,
    unlockPrivileged: unlocked,
    lanPin,
    privilegedExtra: config.privilegedExtra,
    streamTimeoutMs: config.streamTimeoutMs || 0,
    autoAuth: config.autoAuth !== false,
    deviceRegistry: state.deviceRegistry,
    tunnelPin: config.tunnelPin !== false,
    get passwordAuth() { return Boolean(config.passwordAuth) },
    get authUser() { return config.authUser || 'admin' },
    get publicHost() { return config.publicHost || '' },
    authManager: state.authManager,
    adaptiveCompression: config.adaptiveCompression !== false,
    dshAuthCookie: () => state.dshAuthCookie || '',
    version: state.version,
    banList: state.banList,
    persistBans: () => writeBanFile(state.banFile, state.banList),
  })
}

function start(ctx, config, meta = {}) {
  const deviceRegistry = new DeviceRegistry()
  const banFile = path.join(os.homedir(), '.dsh', 'dsh-lanmode-bans.json')
  const banList = readBanFile(banFile)
  ctx.effect(() => () => {
    deviceRegistry.flush()
  }, 'dsh-lanmode: flush device registry to disk')
  const authManager = new AuthManager({
    deviceRegistry,
    sessionDurationMs: (config.authSessionDays || 30) * 24 * 60 * 60 * 1000,
  })
  ctx.effect(() => () => {
    authManager.destroy()
  }, 'dsh-lanmode: clean up authManager timers')
  const sweepTimer = setInterval(() => {
    try { authManager.sweepDisabled(config.disabledUsers) } catch { /* ignore a bad list */ }
  }, 5000)
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref()
  ctx.effect(() => () => clearInterval(sweepTimer), 'dsh-lanmode: sweep disabled sessions')
  const tunnel = new CloudflareTunnel({
    token: config.tunnelToken,
    mode: config.tunnel || 'quick',
    log: say,
  })
  const pieces = {
    settings: config.settings !== false,
    randomUuid: config.randomUuid !== false,
    clipboard: config.clipboard !== false,
    mobileEnterSends: config.mobileEnterSends === true,
    get passwordAuth() { return Boolean(config.passwordAuth) },
    get authUser() { return config.authUser || 'admin' },
    get publicHost() { return config.publicHost || '' },
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
    unlockPrivileged: null,
    lanPin: Boolean(config.lanPin),
    get passwordAuth() { return Boolean(config.passwordAuth) },
    get authUser() { return config.authUser || 'admin' },
    get publicHost() { return config.publicHost || '' },
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
      return () => {
        state.mdns = false
        stopMdns()
      }
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

    const directKey = JSON.stringify({
      port: cfg.directPort || 3088,
      tls: cfg.tls,
      tlsCert: cfg.tlsCert,
      tlsKey: cfg.tlsKey,
      tlsHosts: cfg.tlsHosts,
      tlsSites: cfg.tlsSites,
      allow: cfg.allow,
      unlockPrivileged: cfg.unlockPrivileged,
      trustedProxyCidrs: cfg.trustedProxyCidrs,
      lanPin: cfg.lanPin,
      lanPinRef: cfg.lanPinRef,
      passwordAuth: cfg.passwordAuth,
      authUser: cfg.authUser,
      publicHost: cfg.publicHost,
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
    syncListener(config).catch((failed) => say('direct listener failed to start: ' + String(failed.message || failed)))
    return () => {
      listenerAlive = false
      if (currentStop) {
        currentStop()
        currentStop = () => {}
      }
      state.listener = null
      activeDirectConfigKey = ''
    }
  }, 'dsh-lanmode: direct bridge listener')

  // Verify attachment points
  ctx.effect(() => {
    let alive = true
    const webServer = ctx.webServer
    const port = webServer && webServer.port
    const fetchIndex = () => {
      let currentToken = ''
      try {
        const conn = ctx.get?.('connection') || ctx.connection
        if (conn && typeof conn.authenticatedUrl === 'function') {
          currentToken = tokenFrom(conn.authenticatedUrl('http://127.0.0.1:' + port))
        }
      } catch (err) {
        if (ctx?.logger && typeof ctx.logger.debug === 'function') {
          ctx.logger.debug(`[dsh-lanmode] connection token extraction deferred: ${err?.message || err}`)
        }
      }
      return fetch('http://127.0.0.1:' + port + '/' + (currentToken ? '?token=' + currentToken : ''))
        .then((answer) => answer.text().then((html) => ({ status: answer.status, html })))
    }

    const timer = setTimeout(() => {
      checkAssumptions({ webServer, fetchIndex })
        .then((results) => {
          if (!alive) return
          state.assumptions = results
          const line = summarize(results)
          if (results.every((item) => item.ok || item.unverifiable)) say(line)
          // eslint-disable-next-line no-console
          else (ctx?.logger || activeCtx?.logger || console).warn('[dsh-lanmode] ' + line)
        })
        .catch((failed) => say('attachment points check failed: ' + String(failed.message || failed)))
    }, 3000)

    return () => { alive = false; clearTimeout(timer) }
  }, 'dsh-lanmode: verify attachment points')

  // Register agent tool / command /mobileqr
  registerMobileQrTool(ctx, state)

  // Diagnostic routes, PWA manifest, CA cert, profiles and QR
  if (config.diagnostics !== false) {
    registerPwaManifestRoute(ctx)

    registerDiagnosticsRoutes(ctx, {
      state,
      config,
      certificateDir,
      readRootCA,
      hostReport,
      healthPage,
      generateCachedQRSvg,
      routes: {
        health: '/dsh-lanmode/health',
        caCert: '/dsh-lanmode/ca.crt',
        manifest: '/dsh-lanmode/manifest.json',
        qr: '/dsh-lanmode/qr',
        probe: '/dsh-lanmode/probe', // returns probeResult
      },
    })

    // #51-#54 Device registry and session management
    registerDeviceRoutes(ctx, {
      state,
      config,
      deviceRegistry,
      resolveClientRole,
      verifyAdminAccess,
      isTrustedSameOrigin,
      routes: {
        devices: '/dsh-lanmode/devices',
        revoke: '/dsh-lanmode/devices/revoke',
        killAll: '/dsh-lanmode/devices/kill-all',
        nickname: '/dsh-lanmode/devices/nickname',
      },
    })

    // #103 Authentication endpoints (login, logout, session)
    registerAuthRoutes(ctx, {
      state,
      config,
      authManager,
      resolveSecret,
      makeSessionCookie,
      clearSessionCookie,
      routes: {
        login: '/dsh-lanmode/auth/login',
        logout: '/dsh-lanmode/auth/logout',
        session: '/dsh-lanmode/auth/session',
      },
    })

    // #46-#50 Cloudflare WAN tunnel management
    registerTunnelRoutes(ctx, {
      state,
      config,
      tunnel,
      resolveSecret,
      resolveClientRole,
      verifyAdminAccess,
      isTrustedSameOrigin,
      routes: {
        status: '/dsh-lanmode/tunnel',
        toggle: '/dsh-lanmode/tunnel/toggle',
      },
    })
  }

  // PWA meta tags and polyfills injection into index.html
  const pwaMeta = (config.pwa !== false)
    ? '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
      + '<meta name="apple-mobile-web-app-capable" content="yes">'
      + '<meta name="mobile-web-app-capable" content="yes">'
      + '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
      + '<meta name="theme-color" content="#1e1e2e">'
      + '<link rel="apple-touch-icon" href="/favicon.ico">'
      + '<link rel="manifest" href="/dsh-lanmode/manifest.json">'
    : ''

  const script = '<script data-dsh-lanmode="1">'
    + 'window.__DSH_LANMODE__=' + JSON.stringify(pieces) + ';'
    + shimSource()
    + '</script>'

  const navScript = '<script data-dsh-lanmode-nav="1">'
    + mobileNavSource()
    + '</script>'

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
      Object.assign(config, updatedCfg)
      state.mode = updatedCfg.mode || state.mode
      if (typeof syncListener === 'function') {
        syncListener(config).catch((err) => say('error applying new settings: ' + String(err.message || err)))
      }
    },
  }
}
