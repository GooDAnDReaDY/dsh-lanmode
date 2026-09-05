// Список разрешённых адресов: ошибка здесь либо запирает дверь перед своими,
// либо оставляет её открытой. И то и другое молча.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addressBytes, allowed, parseAllow, parseRule } from '../lib/access.js'

test('пустой список пускает всех', () => {
  assert.equal(allowed('8.8.8.8', []), true)
  assert.equal(allowed('всё что угодно', []), true)
})

test('одиночный адрес — это подсеть из одного адреса', () => {
  const { rules } = parseAllow(['192.168.1.5'])
  assert.equal(allowed('192.168.1.5', rules), true)
  assert.equal(allowed('192.168.1.6', rules), false)
})

test('подсеть IPv4', () => {
  const { rules } = parseAllow(['192.168.77.0/24'])
  assert.equal(allowed('192.168.1.1', rules), true)
  assert.equal(allowed('192.168.1.255', rules), true)
  assert.equal(allowed('192.168.2.1', rules), false)
})

test('граница подсети считается по битам, а не по байтам', () => {
  const { rules } = parseAllow(['10.0.0.0/12'])
  assert.equal(allowed('10.15.255.255', rules), true)
  assert.equal(allowed('10.16.0.0', rules), false)
})

test('адрес IPv4 внутри записи IPv6 признаётся своим', () => {
  // Именно в таком виде Node отдаёт адрес на сокете двойного стека, и без
  // этого правило для IPv4 не сработало бы вовсе.
  const { rules } = parseAllow(['192.168.77.0/24'])
  assert.equal(allowed('::ffff:192.168.1.5', rules), true)
  assert.equal(allowed('::ffff:192.168.2.5', rules), false)
})

test('подсеть IPv6', () => {
  const { rules } = parseAllow(['fd00::/8'])
  assert.equal(allowed('fd12:3456::1', rules), true)
  assert.equal(allowed('fe80::1', rules), false)
})

test('петля пускается, только если её вписали', () => {
  const { rules } = parseAllow(['192.168.77.0/24'])
  assert.equal(allowed('127.0.0.1', rules), false)
  const local = parseAllow(['127.0.0.0/8', '::1']).rules
  assert.equal(allowed('127.0.0.1', local), true)
  assert.equal(allowed('::1', local), true)
})

test('мусорные записи отбрасываются и не превращаются в правило', () => {
  const { rules, dropped } = parseAllow(['192.168.77.0/24', 'не адрес', '1.2.3.4/99', ''])
  assert.equal(rules.length, 1)
  assert.deepEqual(dropped, ['не адрес', '1.2.3.4/99'])
})

test('список из одного мусора никого не запирает', () => {
  // Опечатка не должна тихо отрезать доступ: пустой набор правил означает
  // «не ограничиваем».
  const { rules } = parseAllow(['не адрес'])
  assert.equal(allowed('192.168.1.5', rules), true)
})

test('неразбираемый адрес гостя не пускается, когда список задан', () => {
  const { rules } = parseAllow(['192.168.77.0/24'])
  assert.equal(allowed(undefined, rules), false)
  assert.equal(allowed('', rules), false)
})

test('разбор адресов', () => {
  assert.deepEqual(addressBytes('1.2.3.4'), [1, 2, 3, 4])
  assert.equal(addressBytes('1.2.3'), null)
  assert.equal(addressBytes('1.2.3.256'), null)
  assert.equal(addressBytes('::1').length, 16)
  assert.deepEqual(addressBytes('::ffff:1.2.3.4').slice(12), [1, 2, 3, 4])
})

test('разбор правила', () => {
  assert.deepEqual(parseRule('1.2.3.4'), { bytes: [1, 2, 3, 4], bits: 32 })
  assert.deepEqual(parseRule('1.2.3.4/8'), { bytes: [1, 2, 3, 4], bits: 8 })
  assert.equal(parseRule('1.2.3.4/33'), null)
  assert.equal(parseRule('1.2.3.4/-1'), null)
})
