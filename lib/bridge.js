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
// Это ровно то, что делает любой обратный прокси, и это же означает, что
// прямой режим открывает харнесс всем, кто дотянется до этого порта, — как и
// nginx сегодня. Пароля здесь нет и быть не может: плагин чужие маршруты не
// перехватывает.

import http from 'node:http'

function rewritten(headers, authority) {
  const out = { ...headers, host: authority }
  if (out.origin) out.origin = 'http://' + authority
  if (out.referer) out.referer = String(out.referer).replace(/^https?:\/\/[^/]+/, 'http://' + authority)
  return out
}

/**
 * @param ctx контекст плагина (нужен ctx.webServer.port)
 * @param options {{host: string, port: number, log: (message: string) => void}}
 * @returns функция остановки
 */
export function startDirectBridge(ctx, options) {
  const upstreamPort = ctx.webServer.port
  if (!upstreamPort) {
    options.log('прямой режим не поднят: веб-сервер ещё не сообщил порт')
    return () => {}
  }
  const authority = '127.0.0.1:' + upstreamPort

  const bridge = http.createServer((req, res) => {
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
  })

  // Веб-сокеты интерфейса идут через Upgrade: их надо передать сырыми.
  bridge.on('upgrade', (req, socket, head) => {
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
    options.log('прямой режим: слушаю ' + options.host + ':' + options.port
      + ', передаю на ' + authority)
  })

  return () => { bridge.close() }
}
