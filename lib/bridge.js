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
import { forceLoopback, isConnectionBundle } from './loopback-source.js'

import { allowed } from './access.js'
import { handoffLocation, shouldHandoff, tokenFrom } from './handoff.js'
import { REFUSED, isPrivileged } from './privileged.js'

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
 * Снять ограничения на время.
 *
 * Ответ агента печатается минутами, а событийный поток живёт часами. Умолчания
 * Node рассчитаны на обычные запросы и такое рвут — молча, посреди ответа, что
 * снаружи выглядит как поломка харнесса. Обратный прокси перед харнессом
 * настраивают ровно так же, иначе он не годится.
 */
/**
 * Пояснение про ядро, которое обходится без нашей правки страницы.
 *
 * До 0.1.2 признак «страница открыта с этой же машины» вычислялся в браузере,
 * и разделы настроек по сети приезжали пустыми — поэтому плагин правил это
 * вычисление в сборке на лету. С 0.1.2 ядро решает то же самое у себя, по
 * заголовку `Host` запроса. Мост подменяет `Host` на петлю с самого начала,
 * значит вопрос закрыт раньше, чем страница успевает его задать.
 *
 * Говорим об этом один раз: иначе строка повторяется на каждый запрос сборки.
 */
let coreNoted = false

function noteSelfSufficientCore(log) {
  if (coreNoted) return
  coreNoted = true
  log('ядро само решает, доверять ли адресу, — по заголовку запроса; правка страницы не нужна')
}

function relaxTimeouts(server, streamTimeoutMs) {
  server.timeout = streamTimeoutMs
  server.requestTimeout = streamTimeoutMs
  server.headersTimeout = streamTimeoutMs || 0
  server.keepAliveTimeout = streamTimeoutMs || 72000
}

/**
 * @param ctx контекст плагина (нужен ctx.webServer.port)
 * @param options {{hosts: string[], port: number, log: (message: string) => void,
 *                  allow?: object[], tls?: {cert: string, key: string},
 *                  unlockPrivileged?: boolean, privilegedExtra?: string[],
 *                  streamTimeoutMs?: number}}
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
  const streamTimeoutMs = options.streamTimeoutMs ?? 0
  const unlocked = options.unlockPrivileged !== false
  // Токен спрашиваем у ядра при каждом отказе, а не запоминаем: он меняется
  // при перезагрузке дерева плагинов, и запомненный увёл бы гостя по кругу.
  const currentToken = () => {
    if (options.autoAuth === false) return ''
    try {
      const connection = ctx.get?.('connection')
      if (connection === undefined) return ''
      return tokenFrom(connection.authenticatedUrl('http://' + authority))
    } catch (noService) {
      return ''
    }
  }
  const hosts = options.hosts && options.hosts.length ? options.hosts : ['0.0.0.0']

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
    if (!unlocked && isPrivileged(req.url, options.privilegedExtra)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(REFUSED)
      return
    }

    // Ответ идёт кусками столько, сколько нужно: ни своих ограничений, ни
    // накопления в памяти.
    req.setTimeout(streamTimeoutMs)
    res.setTimeout(streamTimeoutMs)

    // Сборку с признаком «своя машина» правим на лету, всё остальное идёт
    // кусками как шло. Для неё просим несжатый ответ: иначе пришлось бы
    // распаковывать ради одной строки.
    const patching = isConnectionBundle(req.url)
    const headers = rewritten(req.headers, authority)
    if (patching) headers['accept-encoding'] = 'identity'

    const upstream = http.request({
      host: '127.0.0.1',
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers,
      timeout: streamTimeoutMs || undefined,
    }, (answer) => {
      answer.setTimeout(streamTimeoutMs)
      const handoff = shouldHandoff({
        method: req.method, url: req.url, status: answer.statusCode, token: currentToken(),
      })
      if (handoff) {
        // Тело отказа гостю не нужно, но выкачать его надо: брошенный ответ
        // держал бы соединение с харнессом открытым.
        answer.resume()
        res.writeHead(303, {
          'cache-control': 'no-store',
          'location': handoffLocation(req.url, currentToken()),
          'referrer-policy': 'no-referrer',
        })
        res.end()
        return
      }
      if (!patching) {
        res.writeHead(answer.statusCode || 502, answer.headers)
        answer.pipe(res)
        return
      }
      const parts = []
      answer.on('data', (chunk) => parts.push(chunk))
      answer.on('end', () => {
        const done = forceLoopback(Buffer.concat(parts).toString('utf8'))
        if (!done.changed) noteSelfSufficientCore(options.log)
        const body = Buffer.from(done.source, 'utf8')
        const out = { ...answer.headers }
        out['content-length'] = String(body.length)
        delete out['content-encoding']
        res.writeHead(answer.statusCode || 502, out)
        res.end(body)
      })
      answer.on('error', () => { if (!res.writableEnded) res.end() })
    })
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh-lanmode: харнесс не отвечает')
    })
    req.pipe(upstream)
  }

  const upgrade = (req, socket, head) => {
    if (!welcome(socket.remoteAddress)) {
      try {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        socket.destroy()
      } catch (already) { /* уже мертво */ }
      return
    }
    // Событийный поток живёт часами и молчит между событиями: любой таймаут на
    // этом сокете рано или поздно оборвёт разговор с агентом.
    socket.setTimeout(0)
    socket.setNoDelay(true)

    const upstream = http.request({
      host: '127.0.0.1',
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers: rewritten(req.headers, authority),
    })
    upstream.on('upgrade', (answer, upstreamSocket, upstreamHead) => {
      upstreamSocket.setTimeout(0)
      upstreamSocket.setNoDelay(true)
      const lines = ['HTTP/1.1 101 Switching Protocols']
      for (const [key, value] of Object.entries(answer.headers)) lines.push(key + ': ' + value)
      socket.write(lines.join('\r\n') + '\r\n\r\n')
      // Хвосты рукопожатия — байты, пришедшие в том же пакете, что и ответ. Их
      // надо переложить в ПРОТИВОПОЛОЖНУЮ сторону, и это то место, где мост
      // ошибался с первого выпуска: upstreamHead уходил в socket.unshift, то
      // есть в читающую сторону клиентского сокета. Мост притворялся, будто эти
      // байты прислал браузер, и по конвейеру возвращал их харнессу. Первый
      // кадр — а харнесс шлёт его сразу после рукопожатия — до браузера не
      // доезжал никогда. Снаружи это выглядело так: разговор открыт, сообщение
      // отправлено, а в чате пусто.
      if (upstreamHead && upstreamHead.length) socket.write(upstreamHead)
      if (head && head.length) upstreamSocket.write(head)

      upstreamSocket.pipe(socket)
      socket.pipe(upstreamSocket)
      const drop = () => { try { upstreamSocket.destroy() } catch (already) { /* уже мертво */ } }
      socket.on('error', drop)
      socket.on('close', drop)
    })
    upstream.on('error', () => { try { socket.destroy() } catch (already) { /* уже мертво */ } })
    // head сюда не пишем: это байты уже установленного соединения, а не тело
    // запроса. Их место — в upstreamSocket, сразу после рукопожатия.
    upstream.end()
  }

  const servers = []
  for (const host of hosts) {
    const server = options.tls
      ? https.createServer({ cert: options.tls.cert, key: options.tls.key }, handle)
      : http.createServer(handle)
    server.on('upgrade', upgrade)
    relaxTimeouts(server, streamTimeoutMs)

    server.on('error', (failure) => {
      const code = failure && failure.code
      if (code === 'EADDRINUSE') {
        options.log('порт ' + options.port + ' на адресе ' + host + ' уже занят. '
          + 'Либо там уже кто-то обслуживает сеть, либо порт держит посторонний: '
          + 'смените directPort или освободите его')
      } else if (code === 'EADDRNOTAVAIL') {
        options.log('адрес ' + host + ' на этой машине не поднят — пропускаю его')
      } else {
        options.log('прямой режим не поднялся на ' + host + ': '
          + String(failure && failure.message || failure))
      }
    })

    server.listen(options.port, host, () => {
      options.log('слушаю ' + (options.tls ? 'https://' : 'http://') + host + ':' + options.port
        + ', передаю на ' + authority
        + (rules.length ? ', пускаю ' + rules.length + ' правил(о) из списка' : ', пускаю всех')
        + (unlocked ? '' : ', привилегированные вызовы закрыты'))
    })
    servers.push(server)
  }

  return () => {
    for (const server of servers) {
      try { server.close() } catch (already) { /* уже закрыт */ }
    }
  }
}
