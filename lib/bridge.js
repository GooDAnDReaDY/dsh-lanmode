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
import zlib from 'node:zlib'
import { forceLoopback, isConnectionBundle } from './loopback-source.js'

import { allowed } from './access.js'
import { handoffLocation, shouldHandoff, tokenFrom } from './handoff.js'
import { REFUSED, PIN_REQUIRED, isPrivileged, verifyLanPin, checkPinRateLimit, recordPinAttempt } from './privileged.js'
import { isCloudflareRequest } from './tunnel.js'

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
 *                  lanPin?: string, streamTimeoutMs?: number, autoAuth?: boolean}}
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
  const lanPin = options.lanPin ?? ''

  // Токен спрашиваем у ядра при каждом отказе, а не запоминаем
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

  const deviceRegistry = options.deviceRegistry

  const handle = (req, res) => {
    if (!welcome(req.socket.remoteAddress)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('forbidden')
      return
    }

    // #51-#54: Сессионный контроль и реестр устройств
    if (deviceRegistry) {
      const authHeader = req.headers['authorization'] || ''
      const cookie = req.headers['cookie'] || ''
      const tokenMatch = authHeader.match(/Bearer\s+([a-zA-Z0-9_-]+)/)
        || cookie.match(/dsh_token=([a-zA-Z0-9_-]+)/)
        || (req.url && req.url.match(/[?&]token=([a-zA-Z0-9_-]+)/))
      const token = tokenMatch ? tokenMatch[1] : null
      if (token) {
        if (deviceRegistry.isRevoked(token)) {
          res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('Сессия устройства отозвана')
          return
        }
        deviceRegistry.touch(token, req)
      }
    }

    // #50: Защита входящего трафика Cloudflare WAN-туннеля по PIN-коду
    if (options.tunnelPin && isCloudflareRequest(req.headers)) {
      if (lanPin && !verifyLanPin(req.headers, lanPin)) {
        res.writeHead(403, {
          'content-type': 'text/plain; charset=utf-8',
          'x-dsh-lan-pin-required': '1',
        })
        res.end('Доступ через интернет (WAN) защищен PIN-кодом хоста')
        return
      }
    }

    if (isPrivileged(req.url, options.privilegedExtra)) {
      if (!unlocked) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(REFUSED)
        return
      }
      if (lanPin) {
        const ip = req.socket.remoteAddress
        const limit = checkPinRateLimit(ip)
        if (!limit.allowed) {
          const retrySec = Math.ceil(limit.remainingMs / 1000)
          res.writeHead(429, {
            'content-type': 'text/plain; charset=utf-8',
            'retry-after': String(retrySec),
            'x-dsh-lan-pin-retry-after': String(retrySec),
          })
          res.end('Слишком много неверных попыток PIN. Подождите ' + retrySec + ' сек.')
          return
        }

        const valid = verifyLanPin(req.headers, lanPin)
        recordPinAttempt(ip, valid)
        if (!valid) {
          res.writeHead(403, {
            'content-type': 'text/plain; charset=utf-8',
            'x-dsh-lan-pin-required': '1',
          })
          res.end(PIN_REQUIRED)
          return
        }
      }
    }

    req.setTimeout(streamTimeoutMs)
    res.setTimeout(streamTimeoutMs)

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
        const acceptEncoding = req.headers['accept-encoding'] || ''
        const contentType = String(answer.headers['content-type'] || '')
        const isCompressible = /json|text|javascript|xml|html/i.test(contentType)
        const alreadyCompressed = Boolean(answer.headers['content-encoding'])

        if (!alreadyCompressed && isCompressible && (acceptEncoding.includes('br') || acceptEncoding.includes('gzip'))) {
          const outHeaders = { ...answer.headers }
          delete outHeaders['content-length']
          let stream
          if (acceptEncoding.includes('br') && zlib.createBrotliCompress) {
            outHeaders['content-encoding'] = 'br'
            stream = zlib.createBrotliCompress({
              params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
            })
          } else {
            outHeaders['content-encoding'] = 'gzip'
            stream = zlib.createGzip({ level: 6 })
          }
          res.writeHead(answer.statusCode || 502, outHeaders)
          answer.pipe(stream).pipe(res)
          return
        }

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
    req.on('error', () => { try { upstream.destroy() } catch (_) {} })
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

    if (deviceRegistry) {
      const cookie = req.headers['cookie'] || ''
      const tokenMatch = cookie.match(/dsh_token=([a-zA-Z0-9_-]+)/)
        || (req.url && req.url.match(/[?&]token=([a-zA-Z0-9_-]+)/))
      const token = tokenMatch ? tokenMatch[1] : null
      if (token && deviceRegistry.isRevoked(token)) {
        try {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
          socket.destroy()
        } catch (_) {}
        return
      }
      if (token) deviceRegistry.touch(token, req)
    }

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

      if (upstreamHead && upstreamHead.length) socket.write(upstreamHead)
      if (head && head.length) upstreamSocket.write(head)

      upstreamSocket.pipe(socket)
      socket.pipe(upstreamSocket)

      // #65: Периодический ping каждые 25 сек для защиты от сброса NAT сотовыми операторами
      const pingTimer = setInterval(() => {
        try {
          if (socket.writable && !socket.destroyed) socket.write(Buffer.from([0x89, 0x00]))
          if (upstreamSocket.writable && !upstreamSocket.destroyed) upstreamSocket.write(Buffer.from([0x89, 0x00]))
        } catch (_) {}
      }, 25000)
      const stopPing = () => clearInterval(pingTimer)

      const dropDownstream = () => {
        stopPing()
        try { upstreamSocket.destroy() } catch (_) { /* уже мертво */ }
      }
      const dropUpstream = () => {
        stopPing()
        try { socket.destroy() } catch (_) { /* уже мертво */ }
      }
      socket.on('error', dropDownstream)
      socket.on('close', dropDownstream)
      upstreamSocket.on('error', dropUpstream)
      upstreamSocket.on('close', dropUpstream)
    })
    upstream.on('response', (answer) => {
      const lines = ['HTTP/1.1 ' + answer.statusCode + ' ' + (answer.statusMessage || '')]
      for (const [key, value] of Object.entries(answer.headers)) lines.push(key + ': ' + value)
      lines.push('connection: close')
      try {
        socket.write(lines.join('\r\n') + '\r\n\r\n')
        answer.pipe(socket)
      } catch (already) {
        try { socket.destroy() } catch (dead) { /* уже мертво */ }
      }
    })

    upstream.on('error', () => { try { socket.destroy() } catch (already) { /* уже мертво */ } })
    socket.on('error', () => { try { upstream.destroy() } catch (_) {} })
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
        + (unlocked ? (lanPin ? ', требуется PIN' : '') : ', привилегированные вызовы закрыты'))
    })
    servers.push(server)
  }

  return () => {
    for (const server of servers) {
      try { server.close() } catch (already) { /* уже закрыт */ }
    }
  }
}
