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
//    его нет, и каждый вызов к серверу падает. Приём и заготовка заплатки
//    взяты у dsh-web-lan-access (AcidGr), MIT.
//
// 3. navigator.clipboard. Тоже только для защищённого соединения — без него
//    кнопки «Копировать» молчат. Подставляем запасной путь.
//
// Всё это вставляется в index.html через официальную точку webServer.tapIndex.
//
// Чего здесь намеренно НЕТ — привязки к 0.0.0.0. Она нужна тем, кто ходит на
// харнесс напрямую, и ставится отдельным слоем в cordis.patch.yml профиля
// (образец — в нашем cordis.patch.yml). Включать её вслепую нельзя: если
// перед харнессом стоит обратный прокси на том же порту, они столкнутся.

import z from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startDirectBridge } from './bridge.js'

export const name = 'dsh-lanmode'
export const inject = ['webServer']

export const Config = z.object({
  mode: z
    .string()
    .description('How the browser reaches the harness. '
      + '"proxy": something in front of it already listens on the network (nginx and friends) — '
      + 'the plugin only repairs the page. '
      + '"direct": the plugin also opens a listener of its own on the network and forwards to the '
      + 'harness, so nothing else is needed.')
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
})

const here = path.dirname(fileURLToPath(import.meta.url))

/** Заплатка лежит рядом обычным файлом: так её видно и правится она как код. */
function shimSource() {
  return readFileSync(path.join(here, 'shim.js'), 'utf8')
}

/** Namespace, который плагин объявляет: через него режим правится настройками. */
const NS = 'dsh-lanmode'

export function apply(ctx, config) {
  // Значения берём из сервиса настроек, если он есть: тогда режим правится
  // в настройках, а не только в дереве плагинов. Смена режима требует
  // перезапуска — слушатель поднимается один раз при старте.
  ctx.inject(['settings'], (sctx) => {
    let effective = config
    try {
      const scope = sctx.settings.register(NS, Config, { base: config })
      effective = scope.get() ?? config
    } catch (alreadyRegistered) {
      effective = config
    }
    start(sctx, effective)
  })

  // Без сервиса настроек тоже должно работать — тогда только дерево плагинов.
  ctx.effect(() => {
    if (ctx.get && ctx.get('settings')) return () => {}
    start(ctx, config)
    return () => {}
  }, 'dsh-lanmode: запуск без сервиса настроек')
}

function start(ctx, config) {
  // Прямой режим: свой слушатель на сетевом адресе. В режиме прокси не
  // поднимаем ничего — сеть уже обслуживает кто-то другой.
  if (config.mode === 'direct') {
    ctx.effect(() => startDirectBridge(ctx, {
      host: config.directHost || '0.0.0.0',
      port: config.directPort || 3088,
      // eslint-disable-next-line no-console
      log: (message) => console.info('[dsh-lanmode] ' + message),
    }), 'dsh-lanmode: слушатель прямого режима')
  }

  const pieces = {
    settings: config.settings !== false,
    randomUuid: config.randomUuid !== false,
    clipboard: config.clipboard !== false,
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
