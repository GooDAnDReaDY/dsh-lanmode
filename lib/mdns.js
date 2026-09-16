// mDNS (Multicast DNS) responder for local network discovery (dsh.local).
//
// Enables accessing https://dsh.local:3088 from smartphones, tablets,
// and other computers on the LAN without manually looking up IP addresses.
//
// Built with native node:dgram (zero external runtime dependencies).
// Answers A (IPv4) and AAAA (IPv6) queries for the configured mDNS name,
// as well as DNS-SD PTR/SRV/TXT service discovery queries for:
// - _http._tcp.local / _https._tcp.local
// - _dsh._tcp.local
// Zero hardcoded Cyrillic characters.

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

/** Encode TXT record strings into DNS TXT format. */
function encodeTxtRecord(strings = []) {
  const chunks = []
  for (const str of strings) {
    const buf = Buffer.from(String(str), 'utf8')
    const len = Math.min(buf.length, 255)
    chunks.push(Buffer.from([len]))
    chunks.push(buf.subarray(0, len))
  }
  if (chunks.length === 0) {
    return Buffer.from([0])
  }
  return Buffer.concat(chunks)
}

/**
 * Build DNS-SD Service Discovery response packet (PTR, SRV, TXT, A, AAAA).
 * Supports _http._tcp.local, _https._tcp.local, and _dsh._tcp.local.
 */
export function buildServiceResponse(serviceType, hostName, port, addresses = [], txt = []) {
  const serviceName = serviceType.toLowerCase()
  const instanceName = `DeepSeek Harness on ${hostName.replace(/\.local$/, '')}.${serviceName}`
  const answers = []

  // 1. PTR record: serviceName -> instanceName
  const ptrTarget = encodeDnsName(instanceName)
  const ptrRecord = Buffer.alloc(10 + ptrTarget.length)
  ptrRecord.writeUInt16BE(12, 0) // TYPE = PTR
  ptrRecord.writeUInt16BE(0x8001, 2) // CLASS = IN
  ptrRecord.writeUInt32BE(120, 4) // TTL = 120s
  ptrRecord.writeUInt16BE(ptrTarget.length, 8) // RDLENGTH
  ptrTarget.copy(ptrRecord, 10)
  answers.push({ nameBuf: encodeDnsName(serviceName), record: ptrRecord })

  // 2. SRV record: instanceName -> hostName:port
  const hostTarget = encodeDnsName(hostName)
  const srvLen = 6 + hostTarget.length
  const srvRecord = Buffer.alloc(10 + srvLen)
  srvRecord.writeUInt16BE(33, 0) // TYPE = SRV
  srvRecord.writeUInt16BE(0x8001, 2) // CLASS = IN
  srvRecord.writeUInt32BE(120, 4) // TTL = 120s
  srvRecord.writeUInt16BE(srvLen, 8) // RDLENGTH
  srvRecord.writeUInt16BE(0, 10) // Priority = 0
  srvRecord.writeUInt16BE(0, 12) // Weight = 0
  srvRecord.writeUInt16BE(port || 3080, 14) // Port
  hostTarget.copy(srvRecord, 16)
  answers.push({ nameBuf: encodeDnsName(instanceName), record: srvRecord })

  // 3. TXT record: instanceName -> txt properties
  const txtPayload = encodeTxtRecord(txt.length ? txt : ['txtvers=1', 'path=/', 'app=dsh'])
  const txtRecord = Buffer.alloc(10 + txtPayload.length)
  txtRecord.writeUInt16BE(16, 0) // TYPE = TXT
  txtRecord.writeUInt16BE(0x8001, 2) // CLASS = IN
  txtRecord.writeUInt32BE(120, 4) // TTL = 120s
  txtRecord.writeUInt16BE(txtPayload.length, 8) // RDLENGTH
  txtPayload.copy(txtRecord, 10)
  answers.push({ nameBuf: encodeDnsName(instanceName), record: txtRecord })

  // 4. Additional A / AAAA records for hostName
  const hostBuf = encodeDnsName(hostName)
  for (const addr of addresses) {
    const raw = addressBytes(addr)
    if (!raw) continue
    if (raw.length === 4) {
      const rec = Buffer.alloc(10 + 4)
      rec.writeUInt16BE(1, 0) // A
      rec.writeUInt16BE(0x8001, 2)
      rec.writeUInt32BE(120, 4)
      rec.writeUInt16BE(4, 8)
      for (let i = 0; i < 4; i++) rec[10 + i] = raw[i]
      answers.push({ nameBuf: hostBuf, record: rec })
    } else if (raw.length === 16) {
      const rec = Buffer.alloc(10 + 16)
      rec.writeUInt16BE(28, 0) // AAAA
      rec.writeUInt16BE(0x8001, 2)
      rec.writeUInt32BE(120, 4)
      rec.writeUInt16BE(16, 8)
      for (let i = 0; i < 16; i++) rec[10 + i] = raw[i]
      answers.push({ nameBuf: hostBuf, record: rec })
    }
  }

  // Build Packet
  const header = Buffer.alloc(12)
  header.writeUInt16BE(0, 0)
  header.writeUInt16BE(0x8400, 2) // Response, Authoritative
  header.writeUInt16BE(0, 4) // QDCOUNT
  header.writeUInt16BE(answers.length, 6) // ANCOUNT
  header.writeUInt16BE(0, 8)
  header.writeUInt16BE(0, 10)

  const chunks = [header]
  for (const item of answers) {
    chunks.push(item.nameBuf)
    chunks.push(item.record)
  }
  return Buffer.concat(chunks)
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
 * Start mDNS responder for hostname and Bonjour service subtypes.
 * @param {object} options
 * @param {string} [options.name='dsh.local'] Hostname to announce
 * @param {number} [options.port=3080] Port service listens on
 * @param {string[]} options.addresses Machine network IP addresses
 * @param {Function} [options.log] Logger function
 * @returns {Function} Teardown function
 */
export function startMdnsResponder(options) {
  const hostName = (options.name || 'dsh.local').toLowerCase()
  const port = options.port || 3080
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

  // Recognized Bonjour / DNS-SD service subtypes (#130)
  const serviceSubtypes = [
    '_http._tcp.local',
    '_https._tcp.local',
    '_dsh._tcp.local',
  ]

  socket.on('message', (msg) => {
    try {
      const query = parseQuery(msg)
      if (!query || !query.questions) return

      for (const q of query.questions) {
        // Standard Hostname lookup (A / AAAA)
        if (q.name === hostName) {
          const response = buildResponse(hostName, addresses)
          if (response) {
            socket.send(response, 0, response.length, MDNS_PORT, MDNS_IPV4_GROUP, () => {})
          }
          continue
        }

        // DNS-SD service subtype lookup (PTR / SRV / TXT)
        if (serviceSubtypes.includes(q.name)) {
          const response = buildServiceResponse(q.name, hostName, port, addresses, [
            'txtvers=1',
            'path=/',
            'app=dsh',
            `port=${port}`,
          ])
          if (response) {
            socket.send(response, 0, response.length, MDNS_PORT, MDNS_IPV4_GROUP, () => {})
          }
        }
      }
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
        log(`mDNS responder active: announcing ${hostName} and Bonjour subtypes (${serviceSubtypes.join(', ')}) -> ${addresses.join(', ')}`)
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
