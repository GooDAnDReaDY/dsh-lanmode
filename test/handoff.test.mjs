// Подстановка токена гостю: чистая логика и поведение моста целиком.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import { RETRY_MARK, handoffLocation, shouldHandoff, tokenFrom } from '../lib/handoff.js'
import { startDirectBridge } from '../lib/bridge.js'

test('токен берётся из адреса, который выдаёт ядро', () => {
  assert.equal(tokenFrom('http://127.0.0.1:3080/?token=abc'), 'abc')
  assert.equal(tokenFrom('http://127.0.0.1:3080/'), '', 'сборка без проверки токена не даёт')
  assert.equal(tokenFrom('не адрес'), '')
  assert.equal(tokenFrom(undefined), '')
})

test('за токеном отправляют только страницу и только при отказе', () => {
  const base = { method: 'GET', url: '/', status: 401, token: 'abc' }
  assert.equal(shouldHandoff(base), true)
  // Запрос за данными обязан получить свой ответ: подмена его переходом
  // сломала бы вызывающий код, который ждёт JSON.
  assert.equal(shouldHandoff({ ...base, url: '/api/probe' }), false)
  assert.equal(shouldHandoff({ ...base, method: 'POST' }), false)
  assert.equal(shouldHandoff({ ...base, status: 200 }), false)
  assert.equal(shouldHandoff({ ...base, token: '' }), false, 'подставлять нечего')
})

test('вторая попытка не делается: иначе браузер закружится', () => {
  assert.equal(shouldHandoff({ method: 'GET', url: '/?' + RETRY_MARK + '=1', status: 401, token: 'abc' }), false)
})

test('в адрес попадает наш токен, а чужой выкидывается', () => {
  // Два токена подряд ядро считает подделкой и отказывает вовсе.
  const at = handoffLocation('/?token=протухший', 'свежий')
  const params = new URL('http://dsh.invalid' + at).searchParams
  assert.deepEqual(params.getAll('token'), ['свежий'])
  assert.equal(params.get(RETRY_MARK), '1')
})

/** Поддельный харнесс: отказывает без токена, пускает с нужным. */
function fakeHarness(token) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://dsh.invalid')
    if (url.pathname === '/' && url.searchParams.get('token') === token) {
      res.writeHead(303, { location: '/' })
      res.end()
      return
    }
    if (url.pathname === '/') {
      res.writeHead(401, { 'content-type': 'text/plain' })
      res.end('dsh web authentication required')
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('данные')
  })
}

const listen = (server) => new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port))
})

const fetchRaw = (port, path) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
    res.resume()
    res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location }))
  })
  req.on('error', reject)
  req.end()
})

async function withBridge(options, run) {
  const upstream = fakeHarness('живой-токен')
  const upstreamPort = await listen(upstream)
  const probe = http.createServer()
  const bridgePort = await listen(probe)
  probe.close()

  const ctx = {
    webServer: { port: upstreamPort },
    get: (name) => (name === 'connection'
      ? { authenticatedUrl: (base) => base + '/?token=живой-токен' }
      : undefined),
  }
  const stop = startDirectBridge(ctx, {
    hosts: ['127.0.0.1'], port: bridgePort, log: () => {}, ...options,
  })
  await new Promise((resolve) => setTimeout(resolve, 120))
  try {
    await run(bridgePort)
  } finally {
    stop()
    upstream.close()
  }
}

test('гость с сети получает переход на адрес с токеном, а не отказ', async () => {
  await withBridge({}, async (port) => {
    const out = await fetchRaw(port, '/')
    assert.equal(out.status, 303)
    assert.match(out.location, /token=/)
    assert.match(out.location, new RegExp(RETRY_MARK))
  })
})

test('запрос за данными отказ получает как есть', async () => {
  await withBridge({}, async (port) => {
    assert.equal((await fetchRaw(port, '/api/probe')).status, 200)
  })
})

test('выключенная подстановка возвращает прежний отказ', async () => {
  // Выключатель нужен: подстановка снимает последнюю преграду перед тем, кто
  // дотянулся до порта, и это решение хозяина машины, а не плагина.
  await withBridge({ autoAuth: false }, async (port) => {
    assert.equal((await fetchRaw(port, '/')).status, 401)
  })
})
