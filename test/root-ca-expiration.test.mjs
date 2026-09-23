// Issue #165: Корневой CA не должен пересоздаваться при каждом запуске.
// Проверка корректности работы inspect() и отсутствия ложного 'nearing expiration'.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { inspect, ensureCertificate } from '../lib/tls.js'

test('Issue #165: inspect() возвращает валидный expires timestamp', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-ca-test-'))
  try {
    const logs = []
    const log = (msg) => logs.push(msg)

    // Первый выпуск CA и сертификата
    const first = await ensureCertificate({
      dir: tmpDir,
      hosts: ['127.0.0.1', 'localhost'],
      log,
    })

    assert.ok(first.caCert, 'CA сертификат должен быть создан')
    assert.ok(first.fingerprint, 'Отпечаток сервера должен быть вычислен')

    const caInfo = inspect(first.caCert)
    assert.ok(caInfo.validTo instanceof Date, 'validTo должен быть Date')
    assert.equal(typeof caInfo.expires, 'number', 'expires должен быть числом миллисекунд')
    assert.ok(caInfo.expires > Date.now() + 365 * 86400 * 1000, 'Срок действия CA должен быть более 1 года')

    // Очищаем лог перед повторным вызовом
    logs.length = 0

    // Второй вызов на той же директории — симуляция повторного рестарта DSH
    const second = await ensureCertificate({
      dir: tmpDir,
      hosts: ['127.0.0.1', 'localhost'],
      log,
    })

    assert.equal(second.issued, false, 'Сертификат сервера не должен перевыпускаться')
    assert.equal(second.fingerprint, first.fingerprint, 'Отпечаток сервера должен совпадать')
    assert.equal(second.caCert, first.caCert, 'CA сертификат должен остаться прежним')

    // Проверяем, что в логах НЕТ сообщения о перевыпуске CA
    const reissuedCaLog = logs.some((l) => l.includes('Root CA certificate is nearing expiration') || l.includes('generating dsh-lanmode Local Root CA'))
    assert.equal(reissuedCaLog, false, 'Лог не должен содержать сообщений о генерации нового CA')
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
