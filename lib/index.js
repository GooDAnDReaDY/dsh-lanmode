// dsh-lanmode — хост-половина.
//
// Плагин возвращает веб-интерфейсу то, что он сам себе запрещает на странице,
// открытой не с localhost. Три независимых куска, каждый выключается отдельно.
//
// 1. Настройки. Интерфейс решает по имени хоста страницы:
//
//      isLoopback: pageLocation === undefined || isLoopbackHostname(hostname)
//
//    и своими считает только localhost, [::1] и 127.0.0.0/8. Дальше сервис
//    настроек уходит в режим «памяти»: общий вид документа не читается никогда,
//    каждый раздел получает статус "unavailable", запись выбрасывается до
//    отправки. Наружу это выглядит как пустые карточки всех плагинов, пустая
//    вкладка «Настройки плагинов» и страница «Модели» с надписью
//    "settings are unavailable in this browser". Сервер это ограничение не
//    разделяет: describe и mutate по сети отвечают штатно.
//
// 2. crypto.randomUUID. Существует только на защищённом соединении, а
//    интерфейс зовёт его на пути загрузки. На чистом HTTP по сетевому адресу
//    его нет, и каждый вызов к серверу падает.
//
// 3. navigator.clipboard. Тоже только для защищённого соединения — без него
//    кнопки «Копировать» молчат. Подставляем запасной путь.
//
// Всё это вставляется в index.html через официальную точку webServer.tapIndex.
//
// Привязки харнесса к 0.0.0.0 здесь намеренно нет: она задаётся в дереве
// конфигурации, переключателем быть не может и сталкивается с обратным
// прокси на том же порту. Вместо неё — прямой режим со своим слушателем.

import z from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseAllow } from './access.js'
import { checkAssumptions, summarize } from './assumptions.js'
import { bindAddresses } from './bind.js'
import { startDirectBridge } from './bridge.js'
import { isPrivileged } from './privileged.js'
import { healthPage, hostReport } from './health.js'
import { detectMode } from './mode.js'
import { ensureCertificate, localAddresses, readCertificate } from './tls.js'

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
      + 'harness port, and pick proxy if something does. When it cannot tell, it picks proxy: '
      + 'an unnecessary listener on a network address is an open door, and one is not opened on a guess.')
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
    .description('Return the settings service on pages that are not localhost. '
      + 'This is the part no other plugin does.')
    .default(true),
  randomUuid: z
    .boolean()
    .description('Provide crypto.randomUUID where the browser withholds it (plain HTTP). '
      + 'A no-op on HTTPS and on localhost.')
    .default(true),
  clipboard: z
    .boolean()
    .description('Provide a fallback for navigator.clipboard.writeText on plain HTTP, '
      + 'so the copy buttons keep working. A no-op where the real one exists.')
    .default(true),
  tls: z
    .string()
    .description('mode=direct: how the listener is secured. "off" — plain HTTP, as before. '
      + '"self-signed" — the plugin issues a certificate itself (needs openssl) and renews it. '
      + '"files" — use tlsCert and tlsKey. '
      + 'This is what the microphone hangs on: a browser hands out navigator.mediaDevices only over '
      + 'a secure connection, and no page-side substitution can help — there is a real device behind it.')
    .default('off'),
  tlsDir: z
    .string()
    .description('tls=self-signed: where the issued certificate is kept. '
      + 'Empty uses a folder next to the harness data.')
    .default(''),
  tlsHosts: z
    .array(z.string())
    .description('tls=self-signed: extra names and addresses to put into the certificate, '
      + 'on top of this machine\'s own. A certificate issued for one name is refused for every other, '
      + 'even after it has been accepted once.')
    .default([]),
  tlsCert: z.string().description('tls=files: path to the certificate in PEM.').default(''),
  tlsKey: z.string().description('tls=files: path to the private key in PEM.').default(''),
  allow: z
    .array(z.string())
    .description('mode=direct: who may connect — addresses and CIDR ranges. Empty means everyone, '
      + 'as before. This is not a password: whoever is on the list gets in unchecked. It narrows the '
      + 'circle, nothing more. Behind a reverse proxy it is meaningless — every request arrives from '
      + 'the proxy.')
    .default([]),
  unlockPrivileged: z
    .boolean()
    .description('mode=direct: let the settings, credentials, agent-preset, path-opening and '
      + 'model-discovery calls through. The harness pins those to the loopback on purpose, and the '
      + 'bridge lifts that pin because without it a page on the network can show settings but '
      + 'neither read nor write them — which is the whole point of this plugin. '
      + 'The price, stated plainly: any device that reaches this port can read and change your API '
      + 'keys with no authentication whatsoever. Turn it off for a network you do not trust, and '
      + 'fill in "allow" either way.')
    .default(true),
  privilegedExtra: z
    .array(z.string())
    .description('mode=direct: extra path patterns to treat as privileged, for plugins that add '
      + 'their own loopback-pinned calls. Regular expressions over the request path.')
    .default([]),
  streamTimeoutMs: z
    .number()
    .description('mode=direct: how long a single request may take. Zero means no limit, and that is '
      + 'the default: an agent reply is printed over minutes and the event stream lives for hours, '
      + 'while Node cuts both by default.')
    .default(0),
  diagnostics: z
    .boolean()
    .description('Serve GET /dsh-lanmode/health: what is patched, which mode is on, and what the '
      + 'browser actually sees. Nothing secret is on that page — it is open to anyone who reached '
      + 'the harness.')
    .default(true),
})

const here = path.dirname(fileURLToPath(import.meta.url))

/** Заплатка лежит рядом обычным файлом: так её видно и правится она как код. */
function shimSource() {
  return readFileSync(path.join(here, 'shim.js'), 'utf8')
}

/** Namespace, который плагин объявляет: через него режим правится настройками. */
const NS = 'dsh-lanmode'

/** Версия из манифеста: она нужна странице диагностики и отчётам об ошибках. */
function version() {
  try {
    return JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version
  } catch (unreadable) {
    return 'неизвестна'
  }
}

const say = (message) => {
  // eslint-disable-next-line no-console
  console.info('[dsh-lanmode] ' + message)
}

export function apply(ctx, config) {
  // Запуск ровно один. Раньше их было два: путь со службой настроек и путь без
  // неё срабатывали оба, потому что в момент проверки службы ещё не было. С
  // одной только вставкой заплатки это сходило с рук — она защищена от повтора.
  // С появлением слушателя, списка адресов и страницы диагностики перестало:
  // страница показывала одно состояние, а мост работал по другому.
  let started = false

  const once = (usingCtx, effective) => {
    if (started) return
    started = true
    start(usingCtx, effective)
  }

  // Значения берём из службы настроек, если она есть: тогда режим правится в
  // настройках, а не только в дереве плагинов. Смена режима требует
  // перезапуска — слушатель поднимается один раз при старте.
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

  // Без службы настроек тоже должно работать — тогда только дерево плагинов.
  // Ждём: службы может не быть вовсе, а может не быть ещё. Различить это можно
  // только временем, и лучше подождать, чем запуститься не тем набором.
  ctx.effect(() => {
    const timer = setTimeout(() => once(ctx, config), 2000)
    return () => clearTimeout(timer)
  }, 'dsh-lanmode: запуск без службы настроек')
}

/**
 * Куда складывать выпущенный сертификат.
 *
 * Рядом с прочими данными харнесса, если он сказал где; иначе — куда указал
 * человек. Своего пути плагин не выдумывает: писать в неизвестное место чужой
 * машины он не вправе.
 */
function certificateDir(config) {
  if (config.tlsDir) return config.tlsDir
  const home = process.env.DSH_HOME
  return home ? path.join(home, 'dsh-lanmode') : ''
}

/** Поднять слушатель прямого режима: сначала сертификат, потом мост. */
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
        const hosts = [...new Set([...(config.tlsHosts ?? []), ...localAddresses()])]
        const made = await ensureCertificate({ dir, hosts, log: say })
        tls = made
        state.tls = { enabled: true, source: 'самоподписанный', fingerprint: made.fingerprint }
        say((made.issued ? 'выпущен' : 'взят') + ' сертификат на ' + hosts.length
          + ' имён, отпечаток ' + made.fingerprint)
        say('браузер предупредит о нём один раз: сверьте отпечаток и подтвердите')
      } catch (failed) {
        say('сертификат не выпущен (' + String(failed.message || failed)
          + '). Обычно это значит, что нет openssl: поставьте его или задайте свой '
          + 'сертификат через tls=files. Поднимаю без защищённого соединения, '
          + 'микрофон работать не будет')
      }
    }
  }

  const unlocked = config.unlockPrivileged !== false
  if (unlocked) {
    say('ВНИМАНИЕ: привилегированные вызовы открыты для сети. Настройки, учётные данные '
      + 'и открытие путей на этой машине доступны ЛЮБОМУ, кто дотянется до порта ' + port
      + ', без всякой проверки. Так плагин и делает свою работу, но знать об этом надо.')
    if (rules.length === 0) {
      say('список разрешённых адресов пуст. Заполните allow — это не пароль, но круг сузит.')
    }
  }

  state.listener = { scheme: tls ? 'https' : 'http', hosts, port }
  state.unlockPrivileged = unlocked
  return startDirectBridge(ctx, {
    hosts,
    port,
    log: say,
    allow: rules,
    tls,
    unlockPrivileged: unlocked,
    privilegedExtra: config.privilegedExtra,
    streamTimeoutMs: config.streamTimeoutMs || 0,
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
    tls: { enabled: false },
    pieces,
    allow: Array.isArray(config.allow) ? config.allow : [],
    assumptions: [],
  }

  // Режим: заданный руками — как сказано, `auto` — по тому, обслуживает ли сеть
  // кто-то другой. Слушатель поднимается один раз, поэтому и решение одно.
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

  // Проверка точек крепления: плагин чинит чужое поведение, и его собственная
  // поломка обязана быть заметной.
  ctx.effect(() => {
    let alive = true
    const port = ctx.webServer && ctx.webServer.port
    const fetchIndex = () => fetch('http://127.0.0.1:' + port + '/').then((answer) => answer.text())

    // Даём харнессу договорить о себе: страница отдаётся не в первый миг.
    const timer = setTimeout(() => {
      checkAssumptions({ webServer: ctx.webServer, fetchIndex })
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
  }

  // Ничего не включено — и вставлять нечего.
  if (!pieces.settings && !pieces.randomUuid && !pieces.clipboard) return

  const script = '<script data-dsh-lanmode="1">'
    + 'window.__DSH_LANMODE__=' + JSON.stringify(pieces) + ';'
    + shimSource()
    + '</script>'

  ctx.effect(() => ctx.webServer.tapIndex((html) => {
    if (html.includes('data-dsh-lanmode')) return html
    // Сразу за <head>: заплатка должна отработать раньше всего остального,
    // иначе заглушка приедет после первого же вызова, который её ждёт.
    const at = html.indexOf('<head>')
    if (at === -1) return script + html
    return html.slice(0, at + '<head>'.length) + script + html.slice(at + '<head>'.length)
  }), 'dsh-lanmode: вставка заплатки в index.html')
}
