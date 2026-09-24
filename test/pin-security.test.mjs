import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkPinRateLimit,
  recordPinAttempt,
  verifyLanPin,
  hashLanPin,
  resetPinRateLimit,
  PIN_LOCK_MS,
} from '../lib/privileged.js'

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
  assert.ok(limit.remainingMs > 14 * 60 * 1000, 'остаток блокировки около 15 минут')

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

test('Issue #206: PBKDF2 PIN digest verifies and rejects wrong PIN', () => {
  const digest = hashLanPin('4321')
  assert.ok(digest.startsWith('pbkdf2$'))
  assert.equal(verifyLanPin({ 'x-dsh-lan-pin': '4321' }, digest), true)
  assert.equal(verifyLanPin({ 'x-dsh-lan-pin': '0000' }, digest), false)
})

test('Issue #206: lock duration is fifteen minutes', () => {
  assert.equal(PIN_LOCK_MS, 15 * 60 * 1000)
  resetPinRateLimit()
  const ip = '10.0.0.55'
  for (let i = 0; i < 5; i++) recordPinAttempt(ip, false)
  const limit = checkPinRateLimit(ip)
  assert.equal(limit.allowed, false)
  assert.ok(limit.remainingMs > 14 * 60 * 1000)
  assert.ok(limit.remainingMs <= PIN_LOCK_MS)
  resetPinRateLimit(ip)
})
