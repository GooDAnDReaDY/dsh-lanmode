// Замена обратного прокси: привилегированные вызовы, выбор адреса, потоки.
import assert from 'node:assert/strict'
import http from 'node:http'
import { test } from 'node:test'

import { bindAddresses } from '../lib/bind.js'
import { startDirectBridge } from '../lib/bridge.js'
import { PRIVILEGED, isPrivileged } from '../lib/privileged.js'

// ------------------------------------------------- привилегированные вызовы

test('узнаются вызовы, которые ядро держит на петле', () => {
  assert.ok(isPrivileged('/api/settings.describe'))
  assert.ok(isPrivileged('/api/settings.mutate'))
  assert.ok(isPrivileged('/api/credentials.set'))
  assert.ok(isPrivileged('/api/agentPreset.remove'))
  assert.ok(isPrivileged('/api/host.openPath'))
  assert.ok(isPrivileged('/api/llm.discoverModels'))
})

test('обычные вызовы привилегированными не считаются', () => {
  assert.ok(!isPrivileged('/api/session.history'))
  assert.ok(!isPrivileged('/api/session.prompt'))
  assert.ok(!isPrivileged('/api/events.mux'))
  assert.ok(!isPrivileged('/'))
  assert.ok(!isPrivileged(undefined))
})

test('строка запроса не мешает распознаванию', () => {
  assert.ok(isPrivileged('/api/settings.describe?x=1'))
})

test('похожие, но другие пути не ловятся', () => {
  // Забор строгий, и наш список обязан быть таким же: лишнее совпадение
  // открывает то, что открывать не собирались.
  assert.ok(!isPrivileged('/api/settings.describeAll'))
  assert.ok(!isPrivileged('/x/api/settings.describe'))
})

test('свои правила добавляются настройкой', () => {
  assert.ok(!isPrivileged('/my-plugin/secret'))
  assert.ok(isPrivileged('/my-plugin/secret', ['^/my-plugin/secret$']))
})

test('кривое правило не роняет мост', () => {
  assert.doesNotThrow(() => isPrivileged('/api/session.history', ['([']))
  assert.ok(!isPrivileged('/api/session.history', ['([']))
})

test('список правил ядра не пуст', () => {
  assert.ok(PRIVILEGED.length >= 5)
})

// -------------------------------------------------------- выбор адреса

test('свой порт: слушаем там, где сказали', () => {
  const out = bindAddresses({ directHost: '192.168.1.10', directPort: 3088 }, 3080)
  assert.deepEqual(out, { hosts: ['192.168.1.10'], shared: false })
})

test('порт харнесса и все адреса: привязываемся поимённо', () => {
  // Иначе EADDRINUSE: харнесс уже держит этот порт на петле.
  const out = bindAddresses({ directHost: '0.0.0.0', directPort: 3080 }, 3080)
  assert.equal(out.shared, true)
  assert.ok(out.hosts.length >= 1)
  assert.ok(out.hosts.every((h) => !h.startsWith('127.')), 'петля исключена')
})

test('порт не совпадает с портом харнесса: всё как задано', () => {
  const out = bindAddresses({ directHost: '0.0.0.0', directPort: 3088 }, 3080)
  assert.deepEqual(out, { hosts: ['0.0.0.0'], shared: false })
})

// ---------------------------------------------------------------- мост

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

function request(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'POST' }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end('{}')
  })
}

async function withBridge(options, run) {
  const upstream = http.createServer((req, res) => {
    if (req.url === '/slow') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.write('первый кусок')
      setTimeout(() => res.end('|последний кусок'), 300)
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('дошло: ' + req.url)
  })
  const upstreamPort = await listen(upstream)
  const probe = http.createServer()
  const bridgePort = await listen(probe)
  probe.close()

  const stop = startDirectBridge({ webServer: { port: upstreamPort } },
    Object.assign({ hosts: ['127.0.0.1'], port: bridgePort, log: () => {} }, options))
  await new Promise((resolve) => setTimeout(resolve, 150))
  try {
    await run(bridgePort)
  } finally {
    stop()
    upstream.close()
  }
}

test('обход выключен: привилегированный вызов не уходит к харнессу', async () => {
  await withBridge({ unlockPrivileged: false }, async (port) => {
    const answer = await request(port, '/api/credentials.set')
    assert.equal(answer.status, 403)
    assert.match(answer.body, /unlockPrivileged/)
  })
})

test('обход выключен: обычный вызов проходит как обычно', async () => {
  await withBridge({ unlockPrivileged: false }, async (port) => {
    const answer = await request(port, '/api/session.history')
    assert.equal(answer.status, 200)
    assert.match(answer.body, /дошло/)
  })
})

test('обход включён: привилегированный вызов доходит', async () => {
  await withBridge({ unlockPrivileged: true }, async (port) => {
    const answer = await request(port, '/api/credentials.set')
    assert.equal(answer.status, 200)
  })
})

test('ответ, приходящий кусками с паузой, доходит целиком', async () => {
  await withBridge({}, async (port) => {
    const answer = await request(port, '/slow')
    assert.equal(answer.body, 'первый кусок|последний кусок')
  })
})

test('несколько адресов — несколько слушателей, и все гасятся', async () => {
  const upstream = http.createServer((req, res) => res.end('ок'))
  const upstreamPort = await listen(upstream)
  const probe = http.createServer()
  const port = await listen(probe)
  probe.close()

  const said = []
  const stop = startDirectBridge({ webServer: { port: upstreamPort } },
    { hosts: ['127.0.0.1', '127.0.0.2'], port, log: (m) => said.push(m) })
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert.equal(said.filter((m) => m.startsWith('слушаю')).length, 2)
  stop()
  upstream.close()
})
