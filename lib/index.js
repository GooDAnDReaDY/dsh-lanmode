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
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseAllow, allowed } from './access.js'
import { checkAssumptions, summarize } from './assumptions.js'
import { bindAddresses } from './bind.js'
import { startDirectBridge } from './bridge.js'
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
import { CloudflareTunnel, isCloudflareRequest } from './tunnel.js'
import { ensureCertificate, localAddresses, readCertificate, readRootCA } from './tls.js'
import { AuthManager, makeSessionCookie, clearSessionCookie } from './auth.js'

export const name = 'dsh-lanmode'
export const inject = ['webServer', 'settings']

export const Config = z.object({
  mode: z
    .string()
    .description('How the browser reaches the harness. '
      + '"proxy": something in front of it already listens on the network (nginx and friends) — '
      + 'the plugin only repairs the page. '
      + '"direct": the plugin also opens a listener of its own on the network and forwards to the '
      + 'harness, so nothing else is needed. '
      + '"auto": look whether anything already answers on this machine\'s network address at the '
      + 'harness port, and pick proxy if something does.')
    .default('auto'),
  directHost: z
    .string()
    .description('mode=direct: which address to listen on. 0.0.0.0 means every interface.')
    .default('0.0.0.0'),
  directPort: z
    .number()
    .description('mode=direct: which port to listen on. Keep it clear of whatever else is running.')
    .default(3088),
  settings: z
    .boolean()
    .description('Return the settings service on pages that are not localhost.')
    .default(true),
  randomUuid: z
    .boolean()
    .description('Provide crypto.randomUUID where the browser withholds it (plain HTTP).')
    .default(true),
  clipboard: z
    .boolean()
    .description('Provide a fallback for navigator.clipboard.writeText on plain HTTP.')
    .default(true),
  mdns: z
    .boolean()
    .description('Announce domain name via mDNS in local network for zero-config connection.')
    .default(true),
  mdnsName: z
    .string()
    .description('mDNS domain name to announce (e.g. dsh.local, dsh-test.local). Must end in .local.')
    .default('dsh.local'),
  pwa: z
    .boolean()
    .description('Inject PWA manifest and viewport meta tags for standalone mobile app feel.')
    .default(true),
  mobileEnterSends: z
    .boolean()
    .description('Mobile touch keyboards: when true, Enter sends message; when false (default), Enter inserts newline.')
    .default(false),
  tls: z
    .string()
    .description('mode=direct: how the listener is secured. "off" — plain HTTP. '
      + '"self-signed" — the plugin issues a Root CA and server cert (needs openssl). '
      + '"files" — use tlsCert and tlsKey.')
    .default('off'),
  tlsDir: z
    .string()
    .description('tls=self-signed: where the issued certificate is kept. '
      + 'Empty uses a folder next to the harness data.')
    .default(''),
  tlsHosts: z
    .array(z.string())
    .description('tls=self-signed: extra names and addresses to put into the certificate.')
    .default([]),
  tlsCert: z.string().description('tls=files: path to the certificate in PEM.').default(''),
  tlsKey: z.string().description('tls=files: path to the private key in PEM.').default(''),
  allow: z
    .array(z.string())
    .description('mode=direct: who may connect — addresses and CIDR ranges. Empty means everyone.')
    .default([]),
  adminAllow: z
    .array(z.string())
    .description('mode=direct: addresses and CIDR ranges granted admin access (settings, plugins, device revocation). Empty defaults to all allowed.')
    .default([]),
  guestAllow: z
    .array(z.string())
    .description('mode=direct: addresses and CIDR ranges restricted to guest access (chat only).')
    .default([]),
  unlockPrivileged: z
    .boolean()
    .description('mode=direct: let the settings, credentials, and model-discovery calls through.')
    .default(true),
  lanPin: z
    .string()
    .description('mode=direct: optional PIN code (e.g. 4-6 digits) required for privileged operations from LAN. Deprecated: use lanPinRef.')
    .default(''),
  lanPinRef: z
    .string()
    .description('mode=direct: credential reference name or environment variable containing the LAN PIN code.')
    .default(''),
  tunnel: z
    .string()
    .description('Cloudflare WAN tunnel: "off", "quick" (trycloudflare.com), or "named" (token).')
    .default('off'),
  tunnelToken: z
    .string()
    .description('Cloudflare tunnel token (when tunnel="named"). Deprecated: use tunnelTokenRef.')
    .default(''),
  tunnelTokenRef: z
    .string()
    .description('Credential reference name or environment variable containing the Cloudflare tunnel token (when tunnel="named").')
    .default(''),
  tunnelPin: z
    .boolean()
    .description('Require LAN PIN for requests arriving through Cloudflare WAN tunnel.')
    .default(true),
  privilegedExtra: z
    .array(z.string())
    .description('mode=direct: extra path patterns to treat as privileged.')
    .default([]),
  passwordAuth: z
    .boolean()
    .description('Require username and password authentication to access DSH.')
    .default(false),
  authUser: z
    .string()
    .description('Username for password authentication.')
    .default('admin'),
  authPassword: z
    .string()
    .description('Password for authentication. Alternatively use authPasswordRef.')
    .default(''),
  authPasswordRef: z
    .string()
    .description('Reference to credential name in ctx.credentials for authentication password.')
    .default(''),
  authSessionDays: z
    .number()
    .description('Duration of remembered session in days.')
    .default(30),
  streamTimeoutMs: z
    .number()
    .description('mode=direct: how long a single request may take. 0 means no limit.')
    .default(0),
  diagnostics: z
    .boolean()
    .description('Serve GET /dsh-lanmode/health and related endpoints.')
    .default(true),
})

const here = path.dirname(fileURLToPath(import.meta.url))

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

const say = (message) => {
  // eslint-disable-next-line no-console
  console.info('[dsh-lanmode] ' + message)
}

function certificateDir(config) {
  if (config.tlsDir) return config.tlsDir
  const home = process.env.DSH_HOME
  return home ? path.join(home, 'dsh-lanmode') : ''
}

export function apply(ctx, config) {
  let effective = Object.assign({}, config)
  let configSource = 'defaults'
  let configWarning = ''
  let onConfigUpdated = null

  const settingsService = (ctx.get?.('settings') || ctx.settings)?.register ? (ctx.get?.('settings') || ctx.settings) : null

  if (settingsService) {
    try {
      const scope = settingsService.register(NS, Config, { base: config })
      const val = scope.get()
      if (val && typeof val === 'object' && Object.keys(val).length > 0) {
        Object.assign(effective, val)
        configSource = 'settings'
        say('settings loaded from service (mode: ' + (effective.mode || 'auto') + ')')
      } else {
        configSource = (config && Object.keys(config).length > 0) ? 'row' : 'defaults'
        say('settings loaded from ' + configSource + ' (mode: ' + (effective.mode || 'auto') + ')')
      }
      if (typeof scope.subscribe === 'function') {
        scope.subscribe(() => {
          const updated = scope.get()
          if (updated && typeof updated === 'object') {
            Object.assign(effective, updated)
            if (typeof onConfigUpdated === 'function') {
              onConfigUpdated(effective)
            }
          }
        })
      }
    } catch (err) {
      configSource = 'defaults'
      configWarning = 'Failed to register settings: ' + String(err.message || err)
      say('WARNING: ' + configWarning + ' — running with defaults')
    }
  } else {
    configSource = (config && Object.keys(config).length > 0) ? 'row' : 'defaults'
    say('settings service unavailable, running from ' + configSource + ' (mode: ' + (effective.mode || 'auto') + ')')
  }

  const handle = start(ctx, effective, { configSource, configWarning })
  if (handle && typeof handle.onConfigUpdated === 'function') {
    onConfigUpdated = handle.onConfigUpdated
  }
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
        const certHosts = [...new Set([...(config.tlsHosts ?? []), ...localAddresses(mdnsHost)])]
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
    }
  }

  state.listener = { scheme: tls ? 'https' : 'http', hosts, port }
  state.unlockPrivileged = unlocked
  state.lanPin = Boolean(lanPin)

  try {
    const primaryUrl = `${state.listener.scheme}://${state.mdnsName || 'dsh.local'}:${port}/`
    say('QR code for smartphone quick login:' + generateAsciiQR(primaryUrl))
  } catch (_) {}

  // #59, #60: Automatic host firewall port management
  try {
    ensurePortAllowed(port).then((fw) => {
      if (fw.managed && fw.detail) say('Firewall: ' + fw.detail)
    }).catch(() => {})
  } catch (_) {}

  return startDirectBridge(ctx, {
    hosts,
    port,
    log: say,
    allow: rules,
    adminAllow: config.adminAllow,
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
    authManager: state.authManager,
    version: state.version,
  })
}

function start(ctx, config, meta = {}) {
  const deviceRegistry = new DeviceRegistry()
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
    authManager,
    deviceRegistry,
    tunnel,
    tls: { enabled: false },
    caAvailable: false,
    mdns: false,
    mdnsName,
    pieces,
    allow: Array.isArray(config.allow) ? config.allow : [],
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
      const stopMdns = startMdnsResponder({ name: mdnsName, addresses, log: say })
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
      allow: cfg.allow,
      unlockPrivileged: cfg.unlockPrivileged,
      lanPin: cfg.lanPin,
      lanPinRef: cfg.lanPinRef,
      passwordAuth: cfg.passwordAuth,
      authUser: cfg.authUser,
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
    let token = ''
    try {
      const conn = ctx.get?.('connection') || ctx.connection
      if (conn) token = tokenFrom(conn.authenticatedUrl('http://127.0.0.1:' + port))
    } catch (_) {}
    const fetchIndex = () => fetch('http://127.0.0.1:' + port + '/' + (token ? '?token=' + token : ''))
      .then((answer) => answer.text().then((html) => ({ status: answer.status, html })))

    const timer = setTimeout(() => {
      checkAssumptions({ webServer, fetchIndex })
        .then((results) => {
          if (!alive) return
          state.assumptions = results
          const line = summarize(results)
          if (results.every((item) => item.ok || item.unverifiable)) say(line)
          // eslint-disable-next-line no-console
          else console.warn('[dsh-lanmode] ' + line)
        })
        .catch((failed) => say('attachment points check failed: ' + String(failed.message || failed)))
    }, 3000)

    return () => { alive = false; clearTimeout(timer) }
  }, 'dsh-lanmode: verify attachment points')

  // Register agent tool / command /mobileqr
  ctx.inject(['tools'], (tctx) => {
    try {
      tctx.tools.register({
        name: 'mobileqr',
        description: 'Generate QR code and link for instant smartphone or tablet login on local network.',
        parameters: { type: 'object', properties: {} },
        execute: async () => {
          const scheme = state.listener ? state.listener.scheme : 'http'
          const port = state.listener ? state.listener.port : (ctx.webServer?.port || 3088)
          let token = ''
          try {
            const conn = ctx.get?.('connection') || ctx.connection
            if (conn) token = tokenFrom(conn.authenticatedUrl('http://127.0.0.1:' + port))
          } catch (_) {}

          const mdnsHost = state.mdnsName || 'dsh.local'
          const primaryUrl = `${scheme}://${mdnsHost}:${port}/${token ? '?token=' + token : ''}`

          let svg = ''
          try {
            svg = generateQRSvg(primaryUrl, { size: 260 })
          } catch (_) {
            svg = `<p><a href="${primaryUrl}">${primaryUrl}</a></p>`
          }

          return {
            content: [
              {
                type: 'text',
                text: `📱 **Mobile LAN Connection**\n\n`
                  + `* **Address (mDNS):** [${primaryUrl}](${primaryUrl})\n`
                  + `* **Port:** \`${port}\`\n\n`
                  + `Scan this QR code with your mobile camera to connect:`,
              },
              {
                type: 'text',
                text: svg,
              },
            ],
          }
        },
      })
    } catch (_) {}
  })

  // Diagnostic routes, PWA manifest, CA cert, profiles and QR
  if (config.diagnostics !== false) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/health',
      handler: (req, res) => {
        const json = String(req.url ?? '').includes('format=json')
        if (json) {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(hostReport(state), null, 2))
          return
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(healthPage(state))
      },
    }), 'dsh-lanmode: diagnostic health page')

    // Download Root CA certificate
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/ca.crt',
      handler: (req, res) => {
        const dir = certificateDir(config)
        const ca = readRootCA(dir)
        if (!ca) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('Root CA certificate not found or TLS disabled')
          return
        }
        res.writeHead(200, {
          'content-type': 'application/x-x509-ca-cert',
          'content-disposition': 'attachment; filename="dsh-lanmode-root-ca.crt"',
        })
        res.end(ca)
      },
    }), 'dsh-lanmode: download Root CA')

    // PWA Web App Manifest
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/manifest.json',
      handler: (req, res) => {
        const manifest = {
          name: 'DeepSeek Harness',
          short_name: 'DSH',
          id: 'dsh-lanmode-pwa',
          description: 'DeepSeek Harness Web UI Mobile & LAN Gateway',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#11111b',
          theme_color: '#1e1e2e',
          categories: ['utilities', 'productivity', 'developer'],
          icons: [
            { src: '/favicon.ico', sizes: '64x64 32x32 24x24 16x16', type: 'image/x-icon' },
            { src: '/favicon.ico', sizes: '192x192 512x512', type: 'image/x-icon', purpose: 'any maskable' },
          ],
          shortcuts: [
            { name: 'New Chat', url: '/?new=1', description: 'Start a new conversation with agent' },
          ],
        }
        res.writeHead(200, { 'content-type': 'application/manifest+json; charset=utf-8' })
        res.end(JSON.stringify(manifest, null, 2))
      },
    }), 'dsh-lanmode: PWA manifest')

    // QR code for page or arbitrary URL
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/qr',
      handler: (req, res) => {
        try {
          const u = new URL(req.url, 'http://127.0.0.1')
          const mdnsHost = state.mdnsName || 'dsh.local'
          const target = u.searchParams.get('url')
            || (state.listener ? `${state.listener.scheme}://${mdnsHost}:${state.listener.port}/` : `http://${mdnsHost}:3088/`)
          const svg = generateCachedQRSvg(target, { size: 320 })
          const etag = 'W/"' + crypto.createHash('sha1').update(svg).digest('hex').slice(0, 16) + '"'

          if (req.headers['if-none-match'] === etag) {
            res.writeHead(304, {
              'etag': etag,
              'cache-control': 'public, max-age=3600',
            })
            res.end()
            return
          }

          res.writeHead(200, {
            'content-type': 'image/svg+xml; charset=utf-8',
            'etag': etag,
            'cache-control': 'public, max-age=3600',
          })
          res.end(svg)
        } catch (err) {
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('QR error: ' + (err.message || err))
        }
      },
    }), 'dsh-lanmode: QR code generation')

    // #63 Diagnostic port probe (Self-Test)
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/probe',
      handler: (req, res) => {
        const probeResult = {
          ok: true,
          scheme: state.listener ? state.listener.scheme : 'http',
          port: state.listener ? state.listener.port : (ctx.webServer?.port || 3088),
          time: new Date().toISOString(),
          uptime: process.uptime(),
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(probeResult, null, 2))
      },
    }), 'dsh-lanmode: diagnostic probe endpoint')

    // #51-#54 Device registry and session management
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/devices',
      handler: (req, res) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(deviceRegistry.list(), null, 2))
      },
    }), 'dsh-lanmode: device registry')

    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/devices/revoke',
      handler: (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'content-type': 'text/plain' })
          res.end('Method Not Allowed')
          return
        }
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            const ok = deviceRegistry.revoke(data.id)
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ ok }))
          } catch (_) {
            res.writeHead(400, { 'content-type': 'text/plain' })
            res.end('Bad Request')
          }
        })
      },
    }), 'dsh-lanmode: revoke device')

    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/devices/kill-all',
      handler: (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'content-type': 'text/plain' })
          res.end('Method Not Allowed')
          return
        }
        deviceRegistry.revokeAll()
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, message: 'All sessions revoked' }))
      },
    }), 'dsh-lanmode: reset all sessions')

    // #103 Authentication endpoints (login, logout, session)
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/auth/login',
      handler: (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'content-type': 'text/plain' })
          res.end('Method Not Allowed')
          return
        }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', async () => {
          try {
            let data = {}
            if (req.headers['content-type']?.includes('application/json')) {
              data = JSON.parse(body || '{}')
            } else {
              const params = new URLSearchParams(body)
              data = {
                username: params.get('username'),
                password: params.get('password'),
                remember: params.get('remember') !== 'false',
              }
            }

            const ip = req.socket?.remoteAddress || ''
            const limit = authManager.checkRateLimit(ip)
            if (!limit.allowed) {
              const retrySec = Math.ceil(limit.remainingMs / 1000)
              res.writeHead(429, {
                'content-type': 'application/json; charset=utf-8',
                'retry-after': String(retrySec),
              })
              res.end(JSON.stringify({ error: 'Too many failed attempts', retryAfter: retrySec }))
              return
            }

            const expectedUser = config.authUser || 'admin'
            const expectedPassword = await resolveSecret(ctx, config.authPasswordRef, config.authPassword)

            const valid = authManager.verifyCredentials(data.username, data.password, expectedUser, expectedPassword)
            authManager.recordAttempt(ip, valid)

            if (!valid) {
              res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ error: 'Invalid username or password' }))
              return
            }

            const session = authManager.createSession(data.username, req, data.remember !== false)
            const isSecure = Boolean(state.tls?.enabled)
            const cookie = makeSessionCookie(session.token, session.expiresAt, isSecure)

            if (!req.headers['content-type']?.includes('application/json')) {
              res.writeHead(303, {
                'location': '/',
                'set-cookie': cookie,
              })
              res.end()
              return
            }

            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'set-cookie': cookie,
            })
            res.end(JSON.stringify({ ok: true, username: data.username, expiresAt: session.expiresAt }))
          } catch (err) {
            res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: err.message || String(err) }))
          }
        })
      },
    }), 'dsh-lanmode: login auth')

    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/auth/logout',
      handler: (req, res) => {
        const token = authManager.extractToken(req)
        if (token) authManager.revokeSession(token)
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'set-cookie': clearSessionCookie(),
        })
        res.end(JSON.stringify({ ok: true }))
      },
    }), 'dsh-lanmode: logout auth')

    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/auth/session',
      handler: (req, res) => {
        const token = authManager.extractToken(req)
        const session = token ? authManager.validateSession(token) : null
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({
          enabled: Boolean(config.passwordAuth),
          authenticated: Boolean(session),
          user: session ? session.user : null,
        }))
      },
    }), 'dsh-lanmode: auth session status')

    // #46-#50 Cloudflare WAN tunnel management
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/tunnel',
      handler: (req, res) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(tunnel.getState(), null, 2))
      },
    }), 'dsh-lanmode: WAN tunnel status')

    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/tunnel/toggle',
      handler: (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'content-type': 'text/plain' })
          res.end('Method Not Allowed')
          return
        }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}')
            const port = state.listener ? state.listener.port : (ctx.webServer?.port || 3088)
            if (data.enabled) {
              const liveToken = await resolveSecret(ctx, config.tunnelTokenRef, config.tunnelToken)
              if (liveToken) tunnel.token = liveToken
              await tunnel.start({ port })
            } else {
              tunnel.stop()
            }
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify(tunnel.getState()))
          } catch (err) {
            res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: err.message || String(err) }))
          }
        })
      },
    }), 'dsh-lanmode: toggle WAN tunnel')
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
    const insert = pwaMeta + mobileStyles() + script + navScript
    const match = html.match(/<head[^>]*>/i)
    if (!match) return insert + html
    const at = match.index + match[0].length
    return html.slice(0, at) + insert + html.slice(at)
  }), 'dsh-lanmode: inject shim and PWA in index.html')

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
