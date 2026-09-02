import test from 'node:test'
import assert from 'node:assert/strict'

import { encodeDnsName, parseDnsName, parseQuery, buildResponse } from '../lib/mdns.js'

test('кодирование и декодирование DNS имени dsh.local', () => {
  const encoded = encodeDnsName('dsh.local')
  assert.equal(encoded[0], 3) // len 'dsh'
  assert.equal(encoded.subarray(1, 4).toString(), 'dsh')
  assert.equal(encoded[4], 5) // len 'local'
  assert.equal(encoded.subarray(5, 10).toString(), 'local')
  assert.equal(encoded[10], 0)

  const parsed = parseDnsName(encoded, 0)
  assert.equal(parsed.name, 'dsh.local')
})

test('разбор mDNS запроса для dsh.local', () => {
  const nameBuf = encodeDnsName('dsh.local')
  const qRecord = Buffer.alloc(4)
  qRecord.writeUInt16BE(1, 0) // TYPE = A
  qRecord.writeUInt16BE(1, 2) // CLASS = IN

  const header = Buffer.alloc(12)
  header.writeUInt16BE(0, 0)
  header.writeUInt16BE(0x0000, 2) // Standard query
  header.writeUInt16BE(1, 4) // QDCOUNT = 1

  const packet = Buffer.concat([header, nameBuf, qRecord])
  const query = parseQuery(packet)
  assert.ok(query)
  assert.equal(query.questions.length, 1)
  assert.equal(query.questions[0].name, 'dsh.local')
  assert.equal(query.questions[0].type, 1)
})

test('формирование mDNS ответа с A и AAAA записями', () => {
  const addresses = ['192.168.1.100', '2001:db8::1']
  const response = buildResponse('dsh.local', addresses)
  assert.ok(response)
  assert.ok(response.length > 12)

  // Проверяем флаги ответа
  const flags = response.readUInt16BE(2)
  assert.equal(flags & 0x8000, 0x8000) // Response
  const anCount = response.readUInt16BE(6)
  assert.equal(anCount, 2) // 2 записи
})
