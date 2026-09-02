import test from 'node:test'
import assert from 'node:assert/strict'

import { verifyLanPin } from '../lib/privileged.js'

test('проверка PIN: если PIN не задан, доступ открыт', () => {
  assert.equal(verifyLanPin({}, ''), true)
  assert.equal(verifyLanPin(undefined, null), true)
})

test('проверка PIN через заголовок x-dsh-lan-pin', () => {
  const pin = '4321'
  assert.equal(verifyLanPin({ 'x-dsh-lan-pin': '4321' }, pin), true)
  assert.equal(verifyLanPin({ 'x-dsh-lan-pin': ' 4321 ' }, pin), true)
  assert.equal(verifyLanPin({ 'x-dsh-lan-pin': '0000' }, pin), false)
  assert.equal(verifyLanPin({}, pin), false)
})

test('проверка PIN через cookie dsh_lan_pin', () => {
  const pin = 'secret123'
  assert.equal(verifyLanPin({ cookie: 'foo=bar; dsh_lan_pin=secret123; other=val' }, pin), true)
  assert.equal(verifyLanPin({ cookie: 'dsh_lan_pin=wrong' }, pin), false)
})
