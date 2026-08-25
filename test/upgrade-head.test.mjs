// Хвост рукопожатия: харнесс шлёт первый кадр в том же пакете, что и ответ 101.
//
// Этот случай мост ломал с первого выпуска, и ни один тест его не покрывал:
// upstreamHead уходил в socket.unshift, то есть в читающую сторону клиентского
// сокета, и по конвейеру возвращался обратно харнессу. Снаружи это выглядело
// как «разговор открыт, сообщение отправлено, а в чате пусто».
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'
import net from 'node:net'
import { test } from 'node:test'

import { startDirectBridge } from '../lib/bridge.js'

/** Поддельный харнесс: отвечает на Upgrade и сразу же шлёт кадр — одним куском. */
function fakeUpstream(payload, held) {
  const server = net.createServer((socket) => {
    if (held) held.push(socket)
    socket.once('data', () => {
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n'
        + 'Upgrade: websocket\r\n'
        + 'Connection: Upgrade\r\n'
        + '\r\n'
        + payload,
      )
    })
  })
  return server
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

function freePort() {
  const probe = http.createServer()
  return listen(probe).then((port) => new Promise((resolve) => probe.close(() => resolve(port))))
}

test('первый кадр харнесса доходит до браузера', async () => {
  const payload = 'ПЕРВЫЙ-КАДР'
  const held = []
  const upstream = fakeUpstream(payload, held)
  const upstreamPort = await listen(upstream)
  const port = await freePort()

  const stop = startDirectBridge({ webServer: { port: upstreamPort } },
    { hosts: ['127.0.0.1'], port, log: () => {} })
  await new Promise((resolve) => setTimeout(resolve, 150))

  const seen = await new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/api/events.mux',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
        'Sec-WebSocket-Version': '13',
      },
    })
    req.on('upgrade', (res, socket, head) => {
      let got = head && head.length ? head.toString() : ''
      if (got.includes(payload)) { socket.destroy(); resolve(got); return }
      socket.on('data', (chunk) => {
        got += chunk.toString()
        if (got.includes(payload)) { socket.destroy(); resolve(got) }
      })
      setTimeout(() => { socket.destroy(); resolve(got) }, 1500)
    })
    req.on('response', (res) => reject(new Error('обычный ответ вместо Upgrade: ' + res.statusCode)))
    req.on('error', reject)
    req.end()
  })

  stop()
  for (const socket of held) socket.destroy()
  upstream.close()
  assert.match(seen, new RegExp(payload), 'кадр, посланный вместе с рукопожатием, должен дойти')
})
