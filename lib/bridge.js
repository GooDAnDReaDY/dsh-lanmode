// Прямой режим: слушатель на сетевом адресе, который передаёт всё харнессу.
//
// Зачем не привязка харнесса к 0.0.0.0, как делают соседние плагины. Привязка
// задаётся в дереве конфигурации и меняется только перезапуском, то есть
// «переключателем в плагине» быть не может. Хуже того, если перед харнессом
// уже стоит обратный прокси на том же порту, привязка столкнётся с ним лбами.
// Отдельный слушатель включается и гасится вместе со строкой плагина и живёт
// рядом с любым прокси.
//
// Заголовки Host и Origin переписываются на локальные: харнесс пропускает
// запрос, только когда Origin совпадает с адресом, по которому он слушает.
// Это ровно то, что делает любой обратный прокси.
//
// Кого пускать — решает список разрешённых адресов, если он задан. Это не
// замена паролю: тот, кто в списке, входит без всякой проверки. Это сужение
// круга, и в описании плагина так и сказано.

import http from 'node:http'
import https from 'node:https'

import { allowed } from './access.js'

function rewritten(headers, authority) {
  const out = { ...headers, host: authority }
  if (out.origin) out.origin = 'http://' + authority
  if (out.referer) out.referer = String(out.referer).replace(/^https?:\/\/[^/]+/, 'http://' + authority)
  return out
}

/**
 * Ограничитель частоты жалоб.
 *
 * Сканер из сети даёт сотни отказов в минуту, и без ограничения журнал
 * превращается в поток одинаковых строк, в котором не видно ничего другого.
 */
function throttle(log, everyMs) {
  let last = 0
  let skipped = 0
  return (message) => {
    const now = Date.now()
    if (now - last < everyMs) {
      skipped += 1
      return
    }
    log(skipped ? message + ' (и ещё ' + skipped + ' таких же)' : message)
    last = now
    skipped = 0
  }
}

/**
 * @param ctx контекст плагина (нужен ctx.webServer.port)
 * @param options {{host: string, port: number, log: (message: string) => void,
 *                  allow?: object[], tls?: {cert: string, key: string}}}
 * @returns функция остановки
 */
export function startDirectBridge(ctx, options) {
  const upstreamPort = ctx.webServer.port
  if (!upstreamPort) {
    options.log('прямой режим не поднят: веб-сервер ещё не сообщил порт')
    return () => {}
  }
  const authority = '127.0.0.1:' + upstreamPort
  const rules = options.allow ?? []
  const refuse = throttle(options.log, 10000)

  /** Пускать ли этого гостя; отказ пишется в журнал не чаще раза в десять секунд. */
  const welcome = (address) => {
    if (allowed(address, rules)) return true
    refuse('отказано: адрес ' + String(address) + ' не в списке разрешённых')
    return false
  }

  const handle = (req, res) => {
    if (!welcome(req.socket.remoteAddress)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('forbidden')
      return
    }
    const upstream = http.request({
      host: '127.0.0.1',
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers: rewritten(req.headers, authority),
    }, (answer) => {
      res.writeHead(answer.statusCode || 502, answer.headers)
      answer.pipe(res)
    })
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh-lanmode: харнесс не отвечает')
    })
    req.pipe(upstream)
  }

  const bridge = options.tls
    ? https.createServer({ cert: options.tls.cert, key: options.tls.key }, handle)
    : http.createServer(handle)

  // Веб-сокеты интерфейса идут через Upgrade: их надо передать сырыми. Проверка
  // адреса здесь такая же: пропустить веб-сокеты — значит не сделать ничего,
  // весь разговор с агентом идёт именно по ним.
  bridge.on('upgrade', (req, socket, head) => {
    if (!welcome(socket.remoteAddress)) {
      try {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        socket.destroy()
      } catch (already) { /* уже мертво */ }
      return
    }
    const upstream = http.request({
      host: '127.0.0.1',
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers: rewritten(req.headers, authority),
    })
    upstream.on('upgrade', (answer, upstreamSocket, upstreamHead) => {
      const lines = ['HTTP/1.1 101 Switching Protocols']
      for (const [key, value] of Object.entries(answer.headers)) lines.push(key + ': ' + value)
      socket.write(lines.join('\r\n') + '\r\n\r\n')
      if (upstreamHead && upstreamHead.length) socket.unshift(upstreamHead)
      upstreamSocket.pipe(socket)
      socket.pipe(upstreamSocket)
      const drop = () => { try { upstreamSocket.destroy() } catch (already) { /* уже мертво */ } }
      socket.on('error', drop)
      socket.on('close', drop)
    })
    upstream.on('error', () => { try { socket.destroy() } catch (already) { /* уже мертво */ } })
    if (head && head.length) upstream.write(head)
    upstream.end()
  })

  bridge.on('error', (failure) => {
    options.log('прямой режим не поднялся: ' + String(failure && failure.message || failure))
  })

  bridge.listen(options.port, options.host, () => {
    options.log('прямой режим: слушаю ' + (options.tls ? 'https://' : 'http://')
      + options.host + ':' + options.port + ', передаю на ' + authority
      + (rules.length ? ', пускаю ' + rules.length + ' правил(о) из списка' : ''))
  })

  return () => { bridge.close() }
}
