// dsh-lanmode — хост-половина.
//
// Плагин возвращает веб-интерфейсу то, что он сам себе запрещает на странице,
// открытой не с localhost:
// 1. Настройки и модели (снятие блокировки loopback).
// 2. crypto.randomUUID и navigator.clipboard (полифиллы).
// 3. mDNS-анонс dsh.local, авто-генерация Root CA и серверных сертификатов для микрофона.
// 4. Прямой мост (Direct Bridge) с поддержкой WebSocket, стриминга и токенов.
// 5. PWA Manifest и мобильный viewport.
// 6. Инструмент /mobileqr для быстрого входа со смартфона.

import z from '@deepseek-ai/schemastery'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseAllow } from './access.js'
import { checkAssumptions, summarize } from './assumptions.js'
import { bindAddresses } from './bind.js'
import { startDirectBridge } from './bridge.js'
import { isPrivileged } from './privileged.js'
import { healthPage, hostReport } from './health.js'
import { startMdnsResponder } from './mdns.js'
import { detectMode } from './mode.js'
import { generateQRSvg } from './qr.js'
import { tokenFrom } from './handoff.js'
import { ensureCertificate, localAddresses, readCertificate, readRootCA } from './tls.js'

export const name = 'dsh-lanmode'
export const inject = ['webServer']

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
    .default('proxy'),
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
    .description('Announce dsh.local via mDNS in local network for zero-config connection.')
    .default(true),
  pwa: z
    .boolean()
    .description('Inject PWA manifest and viewport meta tags for standalone mobile app feel.')
    .default(true),
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
  unlockPrivileged: z
    .boolean()
    .description('mode=direct: let the settings, credentials, and model-discovery calls through.')
    .default(true),
  lanPin: z
    .string()
    .description('mode=direct: optional PIN code (e.g. 4-6 digits) required for privileged operations from LAN.')
    .default(''),
  privilegedExtra: z
    .array(z.string())
    .description('mode=direct: extra path patterns to treat as privileged.')
    .default([]),
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
    return '0.6.12'
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
  let started = false

  const once = (usingCtx, effective) => {
    if (started) return
    started = true
    start(usingCtx, effective)
  }

  ctx.inject(['settings'], (sctx) => {
    let effective = config
    try {
      const scope = sctx.settings.register(NS, Config, { base: config })
      effective = scope.get() ?? config
    } catch (alreadyRegistered) {
      effective = config
    }
    once(sctx, effective)
  })

  ctx.effect(() => {
    const timer = setTimeout(() => once(ctx, config), 2000)
    return () => clearTimeout(timer)
  }, 'dsh-lanmode: запуск без службы настроек')
}

/** Поднять слушатель прямого режима. */
async function raiseListener(ctx, config, state) {
  const port = config.directPort || 3088
  const { hosts, shared } = bindAddresses(config, ctx.webServer && ctx.webServer.port)
  if (shared) {
    say('порт ' + port + ' занят харнессом на петле, поэтому слушаю поимённо: ' + hosts.join(', '))
  }
  const { rules, dropped } = parseAllow(config.allow)
  if (dropped.length) say('в списке разрешённых не разобраны записи: ' + dropped.join(', '))

  let tls = null
  if (config.tls === 'files') {
    try {
      tls = readCertificate(config.tlsCert, config.tlsKey)
      state.tls = { enabled: true, source: 'свой сертификат', fingerprint: tls.fingerprint }
    } catch (unreadable) {
      say('сертификат не прочитан (' + String(unreadable.message || unreadable)
        + ') — поднимаю без защищённого соединения, микрофон работать не будет')
    }
  } else if (config.tls === 'self-signed') {
    const dir = certificateDir(config)
    if (!dir) {
      say('некуда положить сертификат: задайте tlsDir — поднимаю без защищённого соединения')
    } else {
      try {
        const certHosts = [...new Set([...(config.tlsHosts ?? []), ...localAddresses()])]
        const made = await ensureCertificate({ dir, hosts: certHosts, log: say })
        tls = made
        state.tls = { enabled: true, source: 'Root CA + серверный', fingerprint: made.fingerprint }
        state.caAvailable = Boolean(made.caCert)
        say((made.issued ? 'выпущен' : 'взят') + ' сертификат на ' + certHosts.length
          + ' имён (включая dsh.local), отпечаток ' + made.fingerprint)
        if (made.caCert) {
          say('Root CA доступен для скачивания по ссылке: /dsh-lanmode/ca.crt')
        }
      } catch (failed) {
        say('сертификат не выпущен (' + String(failed.message || failed)
          + '). Поднимаю без защищённого соединения, микрофон работать не будет')
      }
    }
  }

  const unlocked = config.unlockPrivileged !== false
  const lanPin = config.lanPin ? String(config.lanPin).trim() : ''
  if (unlocked) {
    if (lanPin) {
      say('привилегированные вызовы защищены LAN PIN-кодом.')
    } else {
      say('ВНИМАНИЕ: привилегированные вызовы открыты для сети без PIN.')
    }
    if (rules.length === 0) {
      say('список разрешённых адресов пуст (доступ для всех адресов подсети).')
    }
  }

  state.listener = { scheme: tls ? 'https' : 'http', hosts, port }
  state.unlockPrivileged = unlocked
  state.lanPin = Boolean(lanPin)

  return startDirectBridge(ctx, {
    hosts,
    port,
    log: say,
    allow: rules,
    tls,
    unlockPrivileged: unlocked,
    lanPin,
    privilegedExtra: config.privilegedExtra,
    streamTimeoutMs: config.streamTimeoutMs || 0,
    autoAuth: config.autoAuth !== false,
  })
}

function start(ctx, config) {
  const pieces = {
    settings: config.settings !== false,
    randomUuid: config.randomUuid !== false,
    clipboard: config.clipboard !== false,
  }

  const state = {
    version: version(),
    mode: config.mode,
    modeReason: '',
    listener: null,
    unlockPrivileged: null,
    lanPin: Boolean(config.lanPin),
    tls: { enabled: false },
    caAvailable: false,
    mdns: false,
    pieces,
    allow: Array.isArray(config.allow) ? config.allow : [],
    assumptions: [],
  }

  // Запуск mDNS responder для dsh.local
  if (config.mdns !== false) {
    ctx.effect(() => {
      const addresses = localAddresses().filter((a) => a !== 'localhost' && a !== 'dsh.local' && !/^127\./.test(a) && a !== '::1')
      const stopMdns = startMdnsResponder({ name: 'dsh.local', addresses, log: say })
      state.mdns = true
      return () => {
        state.mdns = false
        stopMdns()
      }
    }, 'dsh-lanmode: mDNS responder (dsh.local)')
  }

  // Режим работы
  ctx.effect(() => {
    let stop = () => {}
    let alive = true

    const decide = async () => {
      let mode = config.mode
      if (mode === 'auto') {
        const verdict = await detectMode({
          addresses: localAddresses(),
          port: ctx.webServer && ctx.webServer.port,
          directPort: config.directPort || 3088,
        })
        mode = verdict.mode
        state.mode = mode
        state.modeReason = verdict.reason
        say('режим выбран сам: ' + mode + ' — ' + verdict.reason)
      }
      if (!alive || mode !== 'direct') return
      stop = await raiseListener(ctx, config, state)
    }

    decide().catch((failed) => say('прямой режим не поднялся: ' + String(failed.message || failed)))
    return () => { alive = false; stop() }
  }, 'dsh-lanmode: слушатель прямого режима')

  // Проверка точек крепления
  ctx.effect(() => {
    let alive = true
    const webServer = ctx.webServer
    const port = webServer && webServer.port
    const fetchIndex = () => fetch('http://127.0.0.1:' + port + '/')
      .then((answer) => answer.text().then((html) => ({ status: answer.status, html })))

    const timer = setTimeout(() => {
      checkAssumptions({ webServer, fetchIndex })
        .then((results) => {
          if (!alive) return
          state.assumptions = results
          const line = summarize(results)
          if (results.every((item) => item.ok)) say(line)
          // eslint-disable-next-line no-console
          else console.warn('[dsh-lanmode] ' + line)
        })
        .catch((failed) => say('проверить точки крепления не вышло: ' + String(failed.message || failed)))
    }, 3000)

    return () => { alive = false; clearTimeout(timer) }
  }, 'dsh-lanmode: проверка точек крепления')

  // Регистрация инструмента / команды /mobileqr
  ctx.inject(['tools'], (tctx) => {
    try {
      tctx.tools.register({
        name: 'mobileqr',
        description: 'Сгенерировать QR-код и ссылку для мгновенного входа со смартфона или планшета в локальной сети.',
        parameters: { type: 'object', properties: {} },
        execute: async () => {
          const scheme = state.listener ? state.listener.scheme : 'http'
          const port = state.listener ? state.listener.port : (ctx.webServer?.port || 3088)
          let token = ''
          try {
            const conn = ctx.get?.('connection')
            if (conn) token = tokenFrom(conn.authenticatedUrl('http://127.0.0.1:' + port))
          } catch (_) {}

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
                text: `📱 **Вход с мобильного устройства в LAN**\n\n`
                  + `* **Адрес (mDNS):** [${primaryUrl}](${primaryUrl})\n`
                  + `* **Порт:** \`${port}\`\n\n`
                  + `Отсканируйте QR-код камерой смартфона для быстрого входа:`,
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

  // Маршруты диагностики, PWA manifest, CA cert и QR
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
    }), 'dsh-lanmode: страница диагностики')

    // Скачивание Root CA сертификата
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/ca.crt',
      handler: (req, res) => {
        const dir = certificateDir(config)
        const ca = readRootCA(dir)
        if (!ca) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('Root CA сертификат не найден или TLS выключен')
          return
        }
        res.writeHead(200, {
          'content-type': 'application/x-x509-ca-cert',
          'content-disposition': 'attachment; filename="dsh-lanmode-root-ca.crt"',
        })
        res.end(ca)
      },
    }), 'dsh-lanmode: скачивание Root CA')

    // PWA Web App Manifest
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/manifest.json',
      handler: (req, res) => {
        const manifest = {
          name: 'DeepSeek Harness',
          short_name: 'DSH',
          description: 'DeepSeek Harness Web UI Mobile & LAN',
          start_url: '/',
          display: 'standalone',
          background_color: '#11111b',
          theme_color: '#1e1e2e',
          icons: [
            { src: '/favicon.ico', sizes: '64x64 32x32 24x24 16x16', type: 'image/x-icon' },
          ],
        }
        res.writeHead(200, { 'content-type': 'application/manifest+json; charset=utf-8' })
        res.end(JSON.stringify(manifest, null, 2))
      },
    }), 'dsh-lanmode: PWA manifest')

    // QR-код для страницы или произвольного URL
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-lanmode/qr',
      handler: (req, res) => {
        try {
          const u = new URL(req.url, 'http://127.0.0.1')
          const target = u.searchParams.get('url')
            || (state.listener ? `${state.listener.scheme}://dsh.local:${state.listener.port}/` : 'http://dsh.local:3088/')
          const svg = generateQRSvg(target, { size: 320 })
          res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8' })
          res.end(svg)
        } catch (err) {
          res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('QR error: ' + (err.message || err))
        }
      },
    }), 'dsh-lanmode: генерация QR')
  }

  // PWA метатеги и полифиллы в index.html
  const pwaMeta = (config.pwa !== false)
    ? '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
      + '<meta name="apple-mobile-web-app-capable" content="yes">'
      + '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
      + '<meta name="theme-color" content="#1e1e2e">'
      + '<link rel="manifest" href="/dsh-lanmode/manifest.json">'
    : ''

  const script = '<script data-dsh-lanmode="1">'
    + 'window.__DSH_LANMODE__=' + JSON.stringify(pieces) + ';'
    + shimSource()
    + '</script>'

  ctx.effect(() => ctx.webServer.tapIndex((html) => {
    if (html.includes('data-dsh-lanmode')) return html
    const insert = pwaMeta + script
    const match = html.match(/<head[^>]*>/i)
    if (!match) return insert + html
    const at = match.index + match[0].length
    return html.slice(0, at) + insert + html.slice(at)
  }), 'dsh-lanmode: вставка заплатки и PWA в index.html')
}
