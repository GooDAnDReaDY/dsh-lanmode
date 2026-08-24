// Мост прямого режима проверяем целиком: поднимаем поддельный харнесс,
// поднимаем мост, ходим через него и смотрим, что увидел харнесс.
// Важна не передача байтов, а переписанные заголовки: без них харнесс
// отвечает 403 на всё, что пришло с сетевого адреса.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { parseAllow } from '../lib/access.js'
import { startDirectBridge } from '../lib/bridge.js'

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

function get(port, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/probe', method: 'POST', headers }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end('{}')
  })
}

async function withBridge(run) {
  let seen = null
  const upstream = http.createServer((req, res) => {
    seen = { headers: req.headers, url: req.url, method: req.method }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('от харнесса')
  })
  const upstreamPort = await listen(upstream)

  const bridge = http.createServer()
  const bridgePort = await listen(bridge)
  bridge.close()

  const messages = []
  const stop = startDirectBridge(
    { webServer: { port: upstreamPort } },
    { host: '127.0.0.1', port: bridgePort, log: (m) => messages.push(m) },
  )
  await new Promise((resolve) => setTimeout(resolve, 120))
  try {
    await run({ bridgePort, upstreamPort, seen: () => seen, messages })
  } finally {
    stop()
    upstream.close()
  }
}

test('запрос доходит до харнесса и ответ возвращается', async () => {
  await withBridge(async ({ bridgePort, seen }) => {
    const answer = await get(bridgePort, { 'content-type': 'application/json' })
    assert.equal(answer.status, 200)
    assert.equal(answer.body, 'от харнесса')
    assert.equal(seen().url, '/api/probe')
    assert.equal(seen().method, 'POST')
  })
})

test('Host и Origin переписываются на локальные, иначе харнесс отвечает отказом', async () => {
  await withBridge(async ({ bridgePort, upstreamPort, seen }) => {
    await get(bridgePort, { origin: 'http://192.168.1.50:3088', referer: 'http://192.168.1.50:3088/chat' })
    const headers = seen().headers
    assert.equal(headers.host, '127.0.0.1:' + upstreamPort)
    assert.equal(headers.origin, 'http://127.0.0.1:' + upstreamPort)
    assert.equal(headers.referer, 'http://127.0.0.1:' + upstreamPort + '/chat')
  })
})

test('заголовки, которых не было, не выдумываются', async () => {
  await withBridge(async ({ bridgePort, seen }) => {
    await get(bridgePort, {})
    assert.equal(seen().headers.origin, undefined)
    assert.equal(seen().headers.referer, undefined)
  })
})

test('без порта харнесса мост не поднимается и говорит об этом', () => {
  const messages = []
  const stop = startDirectBridge({ webServer: {} }, { host: '127.0.0.1', port: 0, log: (m) => messages.push(m) })
  stop()
  assert.match(messages.join(' '), /порт/)
})

test('упавший харнесс превращается в 502, а не в повисший запрос', async () => {
  const upstream = http.createServer(() => {})
  const upstreamPort = await listen(upstream)
  const probe = http.createServer()
  const bridgePort = await listen(probe)
  probe.close()
  upstream.close()

  const stop = startDirectBridge(
    { webServer: { port: upstreamPort } },
    { host: '127.0.0.1', port: bridgePort, log: () => {} },
  )
  await new Promise((resolve) => setTimeout(resolve, 120))
  try {
    const answer = await get(bridgePort, {})
    assert.equal(answer.status, 502)
    assert.match(answer.body, /не отвечает/)
  } finally {
    stop()
  }
})

test('адрес вне списка получает отказ и до харнесса не доходит', async () => {
  // Тест ходит с петли, а разрешена только чужая подсеть — значит отказ.
  const upstream = http.createServer((req, res) => { res.end('дошло') })
  const upstreamPort = await listen(upstream)
  const probe = http.createServer()
  const bridgePort = await listen(probe)
  probe.close()

  const messages = []
  const stop = startDirectBridge(
    { webServer: { port: upstreamPort } },
    {
      host: '127.0.0.1',
      port: bridgePort,
      log: (m) => messages.push(m),
      allow: parseAllow(['10.0.0.0/8']).rules,
    },
  )
  await new Promise((resolve) => setTimeout(resolve, 120))
  try {
    const answer = await get(bridgePort, {})
    assert.equal(answer.status, 403)
    assert.match(messages.join(' '), /не в списке разрешённых/)
  } finally {
    stop()
    upstream.close()
  }
})

test('адрес в списке проходит как обычно', async () => {
  const upstream = http.createServer((req, res) => { res.end('дошло') })
  const upstreamPort = await listen(upstream)
  const probe = http.createServer()
  const bridgePort = await listen(probe)
  probe.close()

  const stop = startDirectBridge(
    { webServer: { port: upstreamPort } },
    { host: '127.0.0.1', port: bridgePort, log: () => {}, allow: parseAllow(['127.0.0.0/8']).rules },
  )
  await new Promise((resolve) => setTimeout(resolve, 120))
  try {
    const answer = await get(bridgePort, {})
    assert.equal(answer.status, 200)
    assert.equal(answer.body, 'дошло')
  } finally {
    stop()
    upstream.close()
  }
})
