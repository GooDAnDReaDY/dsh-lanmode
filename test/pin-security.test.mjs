import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkPinRateLimit, recordPinAttempt } from '../lib/privileged.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Блок 7: #56 Защита от брутфорса LAN PIN (Rate Limiting)', () => {
  const ip = '192.168.1.99'
  assert.equal(checkPinRateLimit(ip).allowed, true, 'первая попытка разрешена')

  recordPinAttempt(ip, false)
  recordPinAttempt(ip, false)
  recordPinAttempt(ip, false)
  recordPinAttempt(ip, false)
  assert.equal(checkPinRateLimit(ip).allowed, true, '4 попытки еще разрешены')

  recordPinAttempt(ip, false) // 5-я неудача
  const limit = checkPinRateLimit(ip)
  assert.equal(limit.allowed, false, 'после 5 неудач доступ заблокирован')
  assert.ok(limit.remainingMs > 25000, 'остаток блокировки около 30 секунд')

  recordPinAttempt(ip, true) // Успешный ввод сбрасывает блокировку
  assert.equal(checkPinRateLimit(ip).allowed, true, 'после успеха счетчик сброшен')
})

test('Блок 7: #55 Модальное окно запроса LAN PIN в shim.js', () => {
  const shim = readFileSync(path.join(here, '..', 'lib', 'shim.js'), 'utf8')
  assert.ok(shim.includes('dsh-pin-modal'), 'в shim.js должен присутствовать элемент dsh-pin-modal')
  assert.ok(shim.includes('x-dsh-lan-pin-required'), 'должен отслеживать заголовок x-dsh-lan-pin-required')
  assert.ok(shim.includes('dsh_lan_pin'), 'должен сохранять PIN в cookie и localStorage')
})

test('Блок 7: #57 Авто-восстановление PWA сессии при вытеснении браузера iOS из памяти', () => {
  const shim = readFileSync(path.join(here, '..', 'lib', 'shim.js'), 'utf8')
  assert.ok(shim.includes('sessionStorage'), 'должен использовать sessionStorage')
  assert.ok(shim.includes('localStorage'), 'должен использовать localStorage для персистенции')
  assert.ok(shim.includes('dsh_'), 'должен синхронизировать ключи dsh_*')
})
