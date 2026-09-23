// Issue #164: Проверка информативных 502 ошибок и корректности checkAssumptions при статусе 303.

import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'

import { checkAssumptions, summarize } from '../lib/assumptions.js'
import { startDirectBridge } from '../lib/bridge.js'

test('Issue #164: checkAssumptions() не падает в дрейф при статусе 303 от ядра', async () => {
  const fakeWebServer = {
    port: 3080,
    tapIndex: (fn) => fn,
  }

  // Ядро возвращает 303 (See Other) при установке сессионной cookie с токеном
  const fetchIndex303 = async () => ({ status: 303, html: '' })

  const results = await checkAssumptions({
    webServer: fakeWebServer,
    fetchIndex: fetchIndex303,
  })

  const line = summarize(results)
  assert.ok(
    !line.includes('MOUNTING POINTS DRIFTED'),
    `Статус 303 не должен приводить к дрейфу допущений, получено: ${line}`
  )
  assert.ok(
    line.includes('mounting points ready') && line.includes('deferred'),
    `Должна быть отложенная готовность, получено: ${line}`
  )
})

test('Issue #164: bridge отдаёт 502 с err.code при недоступности апстрима', async () => {
  const logs = []
  const log = (msg) => logs.push(msg)

  // Порт 39999 никем не слушается — гарантированный ECONNREFUSED
  const deadPort = 39999
  const bridgePort = 39998

  const context = {
    webServer: { port: deadPort },
  }

  const stop = startDirectBridge(context, {
    hosts: ['127.0.0.1'],
    port: bridgePort,
    allow: ['127.0.0.0/8'],
    log,
  })

  try {
    // Ждём старта слушателя
    await new Promise((resolve) => setTimeout(resolve, 100))

    const response = await fetch(`http://127.0.0.1:${bridgePort}/api/test-route`)
    assert.equal(response.status, 502, 'Статус ответа должен быть 502')

    const body = await response.text()
    assert.ok(
      body.includes('ECONNREFUSED'),
      `Тело 502 должно содержать код ошибки (ECONNREFUSED), получено: ${body}`
    )
    assert.ok(
      body.includes('dsh-lanmode: Harness backend is not responding'),
      `Тело 502 должно сохранять префикс dsh-lanmode, получено: ${body}`
    )

    // Проверяем наличие записи в логе
    const errorLogged = logs.some((l) => l.includes('upstream error (ECONNREFUSED)'))
    assert.ok(errorLogged, 'Ошибка апстрима с кодом должна логироваться')
  } finally {
    if (typeof stop === 'function') await stop()
  }
})
