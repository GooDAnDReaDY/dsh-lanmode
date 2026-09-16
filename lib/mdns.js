// mDNS (Multicast DNS) responder for local network discovery (dsh.local).
//
// Enables accessing https://dsh.local:3088 from smartphones, tablets,
// and other computers on the LAN without manually looking up IP addresses.
//
// Built with native node:dgram (zero external runtime dependencies).
// Answers A (IPv4) and AAAA (IPv6) queries for the configured mDNS name.

import dgram from 'node:dgram'
import { addressBytes } from './access.js'

const MDNS_PORT = 5353
const MDNS_IPV4_GROUP = '224.0.0.251'

/** Encode DNS domain name into wire label format (dsh.local -> \x03dsh\x05local\x00). */
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

/** Parse DNS domain name from packet buffer. */
export function parseDnsName(buffer, offset = 0) {
  const parts = []
  let curr = offset
  let jumped = false
  let nextOffset = offset
  let jumps = 0

  while (curr < buffer.length) {
    const len = buffer[curr]
    if (len === 0) {
      if (!jumped) nextOffset = curr + 1
      break
    }
    // DNS name compression pointer (0b11xxxxxx) with loop protection
    if ((len & 0xC0) === 0xC0) {
      if (curr + 1 >= buffer.length || ++jumps > 10) break
      if (!jumped) nextOffset = curr + 2
      jumped = true
      curr = ((len & 0x3F) << 8) | buffer[curr + 1]
      continue
    }
    curr++
    if (curr + len > buffer.length) break
    parts.push(buffer.subarray(curr, curr + len).toString('utf8'))
    curr += len
  }

  return { name: parts.join('.').toLowerCase(), nextOffset: jumped ? nextOffset : curr + 1 }
}

/** Parse incoming mDNS query packet. */
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

/** Build DNS answer packet with A and AAAA resource records. */
export function buildResponse(name, addresses) {
  const nameBuf = encodeDnsName(name)
  const answers = []

  for (const addr of addresses) {
    const raw = addressBytes(addr)
    if (!raw) continue

    if (raw.length === 4) {
      // Type A (IPv4)
      const record = Buffer.alloc(10 + 4)
      record.writeUInt16BE(1, 0) // TYPE = A
      record.writeUInt16BE(0x8001, 2) // CLASS = IN (flush cache bit)
      record.writeUInt32BE(120, 4) // TTL = 120s
      record.writeUInt16BE(4, 8) // RDLENGTH = 4
      for (let i = 0; i < 4; i++) record[10 + i] = raw[i]
      answers.push({ nameBuf, record })
    } else if (raw.length === 16) {
      // Type AAAA (IPv6)
      const record = Buffer.alloc(10 + 16)
      record.writeUInt16BE(28, 0) // TYPE = AAAA
      record.writeUInt16BE(0x8001, 2) // CLASS = IN (flush cache bit)
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
 * Start mDNS responder for hostname (default dsh.local).
 * @param {object} options
 * @param {string} [options.name='dsh.local'] Hostname to announce
 * @param {string[]} options.addresses Machine network IP addresses
 * @param {Function} [options.log] Logger function
 * @returns {Function} Teardown function
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
    log('mDNS failed to create socket: ' + (err.message || err))
    return () => {}
  }

  socket.on('error', (err) => {
    log('mDNS socket error: ' + (err.message || err))
    try { socket.close() } catch (err) { /* bestEffort */ void err }
  })

  socket.on('message', (msg) => {
    try {
      const query = parseQuery(msg)
      if (!query || !query.questions) return

      const matches = query.questions.some((q) => q.name === hostName)
      if (!matches) return

      const response = buildResponse(hostName, addresses)
      if (!response) return

      socket.send(response, 0, response.length, MDNS_PORT, MDNS_IPV4_GROUP, () => {})
    } catch (_) {
      // Ignore corrupted multicast packets
    }
  })

  try {
    socket.bind(MDNS_PORT, () => {
      try {
        socket.addMembership(MDNS_IPV4_GROUP)
        socket.setMulticastTTL(255)
        socket.setMulticastLoopback(true)
        log(`mDNS responder active: announcing ${hostName} -> ${addresses.join(', ')}`)
      } catch (membershipErr) {
        log('mDNS multicast membership failed: ' + (membershipErr.message || membershipErr))
      }
    })
  } catch (bindErr) {
    log('mDNS port 5353 already in use or unavailable: ' + (bindErr.message || bindErr))
  }

  return () => {
    try {
      socket.close()
    } catch (err) { /* bestEffort */ void err }
  }
}
