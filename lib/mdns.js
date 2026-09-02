// mDNS (Multicast DNS) responder для анонса dsh.local в локальной сети.
//
// Позволяет открывать https://dsh.local:3088 с любого смартфона, планшета
// или компьютера в LAN без необходимости узнавать и вводить IP-адрес.
//
// Реализован на стандартном модуле node:dgram без внешних зависимостей.
// Отвечает на запросы типа A (IPv4) и AAAA (IPv6) для имени dsh.local.

import dgram from 'node:dgram'
import { addressBytes } from './access.js'

const MDNS_PORT = 5353
const MDNS_IPV4_GROUP = '224.0.0.251'

/** Кодирование DNS-имени в формат меток (dsh.local -> \x03dsh\x05local\x00). */
export function encodeDnsName(name) {
  const parts = String(name).split('.').filter(Boolean)
  const bytes = []
  for (const part of parts) {
    const buf = Buffer.from(part, 'utf8')
    bytes.push(buf.length)
    for (let i = 0; i < buf.length; i++) bytes.push(buf[i])
  }
  bytes.push(0)
  return Buffer.from(bytes)
}

/** Разбор DNS-имени из буфера пакета. */
export function parseDnsName(buffer, offset = 0) {
  const parts = []
  let curr = offset
  let jumped = false
  let nextOffset = offset

  while (curr < buffer.length) {
    const len = buffer[curr]
    if (len === 0) {
      if (!jumped) nextOffset = curr + 1
      break
    }
    // Сжатие DNS-имени (указатель 0b11xxxxxx)
    if ((len & 0xC0) === 0xC0) {
      if (!jumped) nextOffset = curr + 2
      jumped = true
      curr = ((len & 0x3F) << 8) | buffer[curr + 1]
      continue
    }
    curr++
    parts.push(buffer.subarray(curr, curr + len).toString('utf8'))
    curr += len
  }

  return { name: parts.join('.').toLowerCase(), nextOffset: jumped ? nextOffset : curr + 1 }
}

/** Разбор входящего mDNS-запроса. */
export function parseQuery(msg) {
  if (msg.length < 12) return null
  const flags = msg.readUInt16BE(2)
  const isQuery = (flags & 0x8000) === 0
  if (!isQuery) return null

  const qdCount = msg.readUInt16BE(4)
  if (qdCount === 0) return null

  let offset = 12
  const questions = []
  for (let i = 0; i < qdCount; i++) {
    if (offset >= msg.length) break
    const { name, nextOffset } = parseDnsName(msg, offset)
    offset = nextOffset
    if (offset + 4 > msg.length) break
    const type = msg.readUInt16BE(offset)
    const qClass = msg.readUInt16BE(offset + 2) & 0x7FFF
    offset += 4
    questions.push({ name, type, class: qClass })
  }

  return { questions }
}

/**
 * Собрать ответный DNS-пакет с A / AAAA записями.
 * @param {string} name Имя хоста (например, 'dsh.local')
 * @param {string[]} addresses Список IP-адресов машины
 */
export function buildResponse(name, addresses) {
  const nameBuf = encodeDnsName(name)
  const answers = []

  for (const addr of addresses) {
    const raw = addressBytes(addr)
    if (!raw) continue

    if (raw.length === 4) {
      // Запись типа A (IPv4)
      const record = Buffer.alloc(10 + 4)
      record.writeUInt16BE(1, 0) // TYPE = A
      record.writeUInt16BE(0x8001, 2) // CLASS = IN (с flush cache bit)
      record.writeUInt32BE(120, 4) // TTL = 120s
      record.writeUInt16BE(4, 8) // RDLENGTH = 4
      for (let i = 0; i < 4; i++) record[10 + i] = raw[i]
      answers.push({ nameBuf, record })
    } else if (raw.length === 16) {
      // Запись типа AAAA (IPv6)
      const record = Buffer.alloc(10 + 16)
      record.writeUInt16BE(28, 0) // TYPE = AAAA
      record.writeUInt16BE(0x8001, 2) // CLASS = IN (с flush cache bit)
      record.writeUInt32BE(120, 4) // TTL = 120s
      record.writeUInt16BE(16, 8) // RDLENGTH = 16
      for (let i = 0; i < 16; i++) record[10 + i] = raw[i]
      answers.push({ nameBuf, record })
    }
  }

  if (answers.length === 0) return null

  // Header: 12 bytes
  const header = Buffer.alloc(12)
  header.writeUInt16BE(0, 0) // ID = 0
  header.writeUInt16BE(0x8400, 2) // Flags: Standard Response, Authoritative
  header.writeUInt16BE(0, 4) // QDCOUNT = 0
  header.writeUInt16BE(answers.length, 6) // ANCOUNT = answers.length
  header.writeUInt16BE(0, 8) // NSCOUNT = 0
  header.writeUInt16BE(0, 10) // ARCOUNT = 0

  const chunks = [header]
  for (const item of answers) {
    chunks.push(item.nameBuf)
    chunks.push(item.record)
  }

  return Buffer.concat(chunks)
}

/**
 * Запустить mDNS-слушатель для имени хоста (по умолчанию dsh.local).
 * @param {object} options
 * @param {string} [options.name='dsh.local'] Имя для анонса
 * @param {string[]} options.addresses Список локальных адресов машины
 * @param {Function} [options.log] Функция логирования
 * @returns {Function} Функция остановки mDNS
 */
export function startMdnsResponder(options) {
  const hostName = (options.name || 'dsh.local').toLowerCase()
  const addresses = (options.addresses || []).filter(Boolean)
  const log = options.log || (() => {})

  if (addresses.length === 0) {
    return () => {}
  }

  let socket = null
  try {
    socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  } catch (err) {
    log('mDNS не удалось создать сокет: ' + (err.message || err))
    return () => {}
  }

  socket.on('error', (err) => {
    log('mDNS ошибка сокета: ' + (err.message || err))
  })

  socket.on('message', (msg, rinfo) => {
    try {
      const query = parseQuery(msg)
      if (!query || !query.questions) return

      const matches = query.questions.some((q) => q.name === hostName)
      if (!matches) return

      const response = buildResponse(hostName, addresses)
      if (!response) return

      // Отправляем мультикастом в группу
      socket.send(response, 0, response.length, MDNS_PORT, MDNS_IPV4_GROUP, () => {})
    } catch (e) {
      // Игнорируем поврежденные пакеты
    }
  })

  try {
    socket.bind(MDNS_PORT, () => {
      try {
        socket.addMembership(MDNS_IPV4_GROUP)
        socket.setMulticastTTL(255)
        socket.setMulticastLoopback(true)
        log(`mDNS активен: анонсирую ${hostName} -> ${addresses.join(', ')}`)
      } catch (membershipErr) {
        log('mDNS не удалось подписаться на группу мультикаста: ' + (membershipErr.message || membershipErr))
      }
    })
  } catch (bindErr) {
    log('mDNS порт 5353 занят или недоступен: ' + (bindErr.message || bindErr))
  }

  return () => {
    try {
      socket.close()
    } catch (alreadyClosed) {
      // Уже закрыт
    }
  }
}
