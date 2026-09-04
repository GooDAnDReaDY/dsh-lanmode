// Автовыбор режима, проверка точек крепления и сертификат.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkAssumptions, EXCLUDED_BUNDLE, summarize } from '../lib/assumptions.js'
import { detectMode, isLoopback } from '../lib/mode.js'
import { altNames, stillGood } from '../lib/tls.js'

// ------------------------------------------------------------------ режим

test('кто-то уже отвечает на сетевом адресе — значит прокси', async () => {
  const verdict = await detectMode({
    addresses: ['192.168.1.10'],
    port: 3080,
    probe: async () => true,
  })
  assert.equal(verdict.mode, 'proxy')
  assert.match(verdict.reason, /уже кто-то отвечает/)
})

test('никто не отвечает — поднимаем свой слушатель', async () => {
  const verdict = await detectMode({
    addresses: ['192.168.1.10'],
    port: 3080,
    probe: async () => false,
  })
  assert.equal(verdict.mode, 'direct')
})

test('опрашиваются только те адреса, от которых есть толк', async () => {
  // Петля отвечает всегда, связь-локальные адреса недостижимы без интерфейса,
  // имя машины разрешается в те же адреса. Всё это только тратит время.
  const asked = []
  await detectMode({
    addresses: ['127.0.0.1', '::1', 'localhost', 'my-host', 'fe80::1', '169.254.1.1', '192.168.1.10'],
    port: 3080,
    probe: async (host) => { asked.push(host); return false },
  })
  assert.deepEqual(asked, ['192.168.1.10'])
})

test('адреса опрашиваются разом, а не по очереди', async () => {
  // Их бывает под сотню: последовательный опрос с ожиданием превращает выбор
  // режима в минуты молчания при старте.
  let inFlight = 0
  let peak = 0
  const addresses = ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4']
  await detectMode({
    addresses,
    port: 3080,
    probe: async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 20))
      inFlight -= 1
      return false
    },
  })
  assert.equal(peak, addresses.length)
})

test('не удалось выяснить — ничего не поднимаем', async () => {
  const failed = await detectMode({
    addresses: ['192.168.1.10'],
    port: 3080,
    probe: async () => { throw new Error('сеть недоступна') },
  })
  assert.equal(failed.mode, 'proxy')

  const noPort = await detectMode({ addresses: ['192.168.1.10'], port: 0, probe: async () => false })
  assert.equal(noPort.mode, 'proxy')

  const noAddresses = await detectMode({ addresses: [], port: 3080, probe: async () => false })
  assert.equal(noAddresses.mode, 'proxy')
})

test('занятый порт для своего слушателя — остаёмся в режиме прокси', async () => {
  const verdict = await detectMode({
    addresses: ['192.168.1.10'],
    port: 3080,
    directPort: 3088,
    probe: async (host) => host === '127.0.0.1',
  })
  assert.equal(verdict.mode, 'proxy')
  assert.match(verdict.reason, /уже занят/)
})

test('свободный порт — поднимаемся', async () => {
  const verdict = await detectMode({
    addresses: ['192.168.1.10'],
    port: 3080,
    directPort: 3088,
    probe: async () => false,
  })
  assert.equal(verdict.mode, 'direct')
})

test('свой адрес узнаётся', () => {
  assert.equal(isLoopback('127.0.0.1'), true)
  assert.equal(isLoopback('127.15.0.1'), true)
  assert.equal(isLoopback('::1'), true)
  assert.equal(isLoopback('localhost'), true)
  assert.equal(isLoopback('192.168.1.1'), false)
})

// -------------------------------------------------------- точки крепления

const goodPage = '<html><head><script data-dsh-lanmode="1"></script></head>'
  + '<body><script src="/plugins/' + EXCLUDED_BUNDLE + '/client.js"></script></body></html>'

test('на здоровом харнессе все точки на месте', async () => {
  const results = await checkAssumptions({
    webServer: { tapIndex: () => {}, port: 3080 },
    fetchIndex: async () => ({ status: 200, html: goodPage }),
  })
  assert.ok(results.every((item) => item.ok), JSON.stringify(results))
  assert.match(summarize(results), /на месте/)
})

test('исчезнувшая точка вставки замечена', async () => {
  const results = await checkAssumptions({
    webServer: { port: 3080 },
    fetchIndex: async () => ({ status: 200, html: goodPage }),
  })
  const item = results.find((each) => each.name.includes('вставки'))
  assert.equal(item.ok, false)
  assert.match(summarize(results), /УЕХАЛИ/)
})

test('заплатка не доехала до страницы — это замечено', async () => {
  const results = await checkAssumptions({
    webServer: { tapIndex: () => {}, port: 3080 },
    fetchIndex: async () => ({ status: 200, html: '<html><head></head></html>' }),
  })
  assert.equal(results.find((each) => each.name.includes('заплатка')).ok, false)
})

test('пакет-исключение переименовали — это замечено', async () => {
  // Самый коварный случай: всё работает, но заплатка больше не обходит того,
  // кому нельзя подменять флаг.
  const results = await checkAssumptions({
    webServer: { tapIndex: () => {}, port: 3080 },
    fetchIndex: async () => ({ status: 200, html: '<html><head><script data-dsh-lanmode="1"></script></head></html>' }),
  })
  assert.equal(results.find((each) => each.name.includes('исключение')).ok, false)
})

test('страница не отдаётся — проверка не падает, а сообщает', async () => {
  const results = await checkAssumptions({
    webServer: { tapIndex: () => {}, port: 3080 },
    fetchIndex: async () => { throw new Error('соединение закрыто') },
  })
  assert.equal(results.at(-1).ok, false)
  assert.match(results.at(-1).detail, /соединение закрыто/)
})

test('Issue #34: харнесс с токен-аутентификацией (401/302) не вызывает ложного предупреждения ТОЧКИ КРЕПЛЕНИЯ УЕХАЛИ', async () => {
  const results401 = await checkAssumptions({
    webServer: { tapIndex: () => {}, port: 3080 },
    fetchIndex: async () => ({ status: 401, html: 'authentication required' }),
  })
  assert.ok(results401.every((item) => item.ok || item.unverifiable), JSON.stringify(results401))
  assert.match(summarize(results401), /на месте/)

  const results302 = await checkAssumptions({
    webServer: { tapIndex: () => {}, port: 3080 },
    fetchIndex: async () => ({ status: 302, html: 'redirecting to login' }),
  })
  assert.ok(results302.every((item) => item.ok || item.unverifiable))
  assert.match(summarize(results302), /на месте/)
})

test('Issue #34: настоящая ошибка 500 по-прежнему считается сбоем точек крепления', async () => {
  const results500 = await checkAssumptions({
    webServer: { tapIndex: () => {}, port: 3080 },
    fetchIndex: async () => ({ status: 500, html: 'Internal Server Error' }),
  })
  assert.equal(results500.at(-1).ok, false)
  assert.match(summarize(results500), /УЕХАЛИ/)
})

// ------------------------------------------------------------ сертификат

test('имена и адреса в сертификате различаются', () => {
  assert.equal(altNames(['localhost', '127.0.0.1', '::1', 'мой-хост']),
    'DNS:localhost,IP:127.0.0.1,IP:::1,DNS:мой-хост')
})

test('сертификат годен, пока покрывает адреса и не истекает', () => {
  const now = Date.UTC(2026, 0, 1)
  const info = {
    validTo: new Date(Date.UTC(2027, 0, 1)),
    names: ['localhost', '192.168.1.10'],
    fingerprint: 'AA',
  }
  assert.equal(stillGood(info, ['localhost', '192.168.1.10'], now), true)
})

test('появился новый адрес — сертификат перевыпускается', () => {
  // Формально он жив, но по новому адресу браузер его не примет, и человек
  // будет гадать, почему «вчера работало».
  const now = Date.UTC(2026, 0, 1)
  const info = { validTo: new Date(Date.UTC(2027, 0, 1)), names: ['localhost'], fingerprint: 'AA' }
  assert.equal(stillGood(info, ['localhost', '192.168.1.10'], now), false)
})

test('истекающий сертификат перевыпускается заранее', () => {
  const now = Date.UTC(2026, 0, 1)
  const info = {
    validTo: new Date(Date.UTC(2026, 0, 20)),
    names: ['localhost'],
    fingerprint: 'AA',
  }
  assert.equal(stillGood(info, ['localhost'], now), false)
  assert.equal(stillGood(null, ['localhost'], now), false)
})

// Харнесс с 0.1.2 просит токен и отвечает 401 всем, кто пришёл без него.
// Тело отказа — не страница интерфейса: раньше плагин искал в нём заплатку,
// не находил и уверенно сообщал, что она пропала. Проверка на месте.
test('отказ харнесса не выдаётся за пропавшую заплатку', async () => {
  const results = await checkAssumptions({
    webServer: { tapIndex: () => () => {}, port: 3080 },
    fetchIndex: async () => ({ status: 401, html: 'Unauthorized' }),
  })
  const names = results.map((item) => item.name)
  assert.equal(names.includes('заплатка попала на страницу'), false, 'о заплатке судить нечем')
  const gate = results.find((item) => item.name === 'страница отдаётся нам')
  assert.ok(gate, 'должен быть отдельный вердикт про отказ')
  assert.equal(gate.ok, false)
  assert.match(gate.detail, /401/, 'в пояснении виден код ответа')
})
