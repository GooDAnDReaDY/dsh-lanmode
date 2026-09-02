// Сертификат для прямого режима и локальный Root CA.
//
// Микрофон и голосовой ввод (dsh-voice) браузер отдаёт только на защищённом соединении
// (HTTPS / Secure Context).
//
// Плагин автоматически создаёт связку:
// 1. Локальный корневой сертификат (Root CA, срок 10 лет) — lanmode-ca.pem
// 2. Сертификат сервера с SAN для dsh.local, всех сетевых IP и localhost — lanmode-cert.pem
//
// Пользователь может скачать Root CA по адресу /dsh-lanmode/ca.crt и один раз установить
// его на iPhone, iPad, Android или рабочий ноутбук, получив доверенный зелёный HTTPS.

import { execFile } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { addressBytes } from './access.js'

/** За сколько до истечения перевыпускать серверный сертификат. */
const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000

/** Сколько живёт серверный сертификат (дней). */
const LIFETIME_DAYS = 397

/** Сколько живёт корневой сертификат CA (дней). */
const CA_LIFETIME_DAYS = 3650

const EPHEMERAL_INTERFACE = /^(veth|br-|docker|virbr)/i

function linkLocal(address) {
  return /^fe80:/i.test(address) || /^169\.254\./.test(address)
}

/**
 * Локальные адреса машины, включая dsh.local и сетевые IP.
 */
export function localAddresses() {
  const found = new Set(['localhost', '127.0.0.1', '::1', 'dsh.local'])
  const interfaces = os.networkInterfaces()
  for (const [name, list] of Object.entries(interfaces)) {
    if (EPHEMERAL_INTERFACE.test(name)) continue
    for (const item of list ?? []) {
      if (!item || item.internal) continue
      if (!item.address || linkLocal(item.address)) continue
      found.add(item.address)
    }
  }
  const hostname = os.hostname()
  if (hostname) found.add(hostname)
  return [...found]
}

/** Строка subjectAltName для openssl: имена — DNS, адреса — IP. */
export function altNames(hosts) {
  const parts = []
  for (const host of hosts) {
    const clean = String(host ?? '').trim()
    if (!clean) continue
    const isAddress = /^[0-9.]+$/.test(clean) || clean.includes(':')
    parts.push((isAddress ? 'IP:' : 'DNS:') + clean)
  }
  return parts.join(',')
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).trim()))
      else resolve(String(stdout))
    })
  })
}

/** Проверить доступность openssl в системе. */
export async function checkOpenSsl() {
  try {
    const version = await run('openssl', ['version'])
    return { available: true, version: version.trim() }
  } catch (err) {
    return { available: false, error: String(err.message || err) }
  }
}

/** Информация о сертификате: срок действия, отпечаток SHA256 и имена в SAN. */
export function inspect(certPem) {
  const certificate = new X509Certificate(certPem)
  const names = String(certificate.subjectAltName ?? '')
    .split(',')
    .map((part) => part.trim().replace(/^(DNS|IP Address|IP):/, ''))
    .filter(Boolean)
  return {
    validTo: new Date(certificate.validTo),
    fingerprint: certificate.fingerprint256,
    names,
    isCA: certificate.ca,
  }
}

function canonical(name) {
  const bytes = addressBytes(name)
  if (bytes) return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return String(name).trim().toLowerCase()
}

export function stillGood(info, hosts, now) {
  if (!info) return false
  if (info.validTo.getTime() - now < RENEW_BEFORE_MS) return false
  const covered = new Set(info.names.map(canonical))
  return hosts.every((host) => covered.has(canonical(host)))
}

/**
 * Обеспечить наличие Root CA в директории.
 */
async function ensureRootCA(dir, log) {
  const caCertPath = path.join(dir, 'lanmode-ca.pem')
  const caKeyPath = path.join(dir, 'lanmode-ca-key.pem')

  if (fs.existsSync(caCertPath) && fs.existsSync(caKeyPath)) {
    try {
      const caCert = fs.readFileSync(caCertPath, 'utf8')
      const info = inspect(caCert)
      if (info.validTo.getTime() - Date.now() > RENEW_BEFORE_MS) {
        return { caCertPath, caKeyPath, caCert, fingerprint: info.fingerprint }
      }
    } catch (e) {
      log('корневой сертификат CA не прочитан, создаю заново')
    }
  }

  log('выпускаю корневой сертификат dsh-lanmode Local CA (срок 10 лет)...')
  await run('openssl', [
    'req', '-x509', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256',
    '-days', String(CA_LIFETIME_DAYS),
    '-keyout', caKeyPath,
    '-out', caCertPath,
    '-subj', '/CN=dsh-lanmode Local Root CA',
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
  ])
  try { fs.chmodSync(caKeyPath, 0o600) } catch (_) {}

  const caCert = fs.readFileSync(caCertPath, 'utf8')
  return { caCertPath, caKeyPath, caCert, fingerprint: inspect(caCert).fingerprint }
}

/**
 * Взять готовый сертификат или выпустить связку CA + серверный сертификат.
 *
 * @param options {{dir: string, hosts: string[], log: (message: string) => void, now?: number}}
 * @returns `{ cert, key, fingerprint, caCert, issued }`
 */
export async function ensureCertificate(options) {
  const dir = options.dir
  const hosts = [...new Set([...options.hosts, 'dsh.local'])]
  const now = options.now ?? Date.now()
  const certPath = path.join(dir, 'lanmode-cert.pem')
  const keyPath = path.join(dir, 'lanmode-key.pem')
  const caCertPath = path.join(dir, 'lanmode-ca.pem')

  fs.mkdirSync(dir, { recursive: true })

  let caInfo = null
  try {
    caInfo = await ensureRootCA(dir, options.log)
  } catch (err) {
    options.log('выпуск Root CA не удался: ' + (err.message || err))
  }

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    try {
      const cert = fs.readFileSync(certPath, 'utf8')
      const info = inspect(cert)
      if (stillGood(info, hosts, now)) {
        return {
          cert,
          key: fs.readFileSync(keyPath, 'utf8'),
          fingerprint: info.fingerprint,
          caCert: caInfo?.caCert ?? null,
          issued: false,
        }
      }
      options.log('серверный сертификат перевыпускается: истекает или не покрывает все адреса')
    } catch (unreadable) {
      options.log('сертификат нечитаем, выпускаю заново: ' + String(unreadable.message || unreadable))
    }
  }

  const san = altNames(hosts)

  if (caInfo) {
    try {
      const csrPath = path.join(dir, 'lanmode-csr.pem')
      await run('openssl', [
        'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256',
        '-keyout', keyPath,
        '-out', csrPath,
        '-subj', '/CN=' + (hosts[0] || 'dsh.local'),
        '-addext', 'subjectAltName=' + san,
      ])
      try { fs.chmodSync(keyPath, 0o600) } catch (_) {}

      await run('openssl', [
        'x509', '-req',
        '-in', csrPath,
        '-CA', caInfo.caCertPath,
        '-CAkey', caInfo.caKeyPath,
        '-CAcreateserial',
        '-out', certPath,
        '-days', String(LIFETIME_DAYS),
        '-sha256',
        '-copy_extensions', 'copy',
      ])

      try { fs.unlinkSync(csrPath) } catch (_) {}

      const cert = fs.readFileSync(certPath, 'utf8')
      return {
        cert,
        key: fs.readFileSync(keyPath, 'utf8'),
        fingerprint: inspect(cert).fingerprint,
        caCert: caInfo.caCert,
        issued: true,
      }
    } catch (signErr) {
      options.log('подписание через CA не удалось (' + (signErr.message || signErr) + '), откатываюсь к self-signed')
    }
  }

  // Фолбек на чистый self-signed
  await run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256',
    '-days', String(LIFETIME_DAYS),
    '-keyout', keyPath,
    '-out', certPath,
    '-subj', '/CN=' + (hosts[0] || 'dsh.local'),
    '-addext', 'subjectAltName=' + san,
  ])
  try { fs.chmodSync(keyPath, 0o600) } catch (_) {}

  const cert = fs.readFileSync(certPath, 'utf8')
  return {
    cert,
    key: fs.readFileSync(keyPath, 'utf8'),
    fingerprint: inspect(cert).fingerprint,
    caCert: caInfo?.caCert ?? null,
    issued: true,
  }
}

/** Прочитать сертификат и ключ, указанные человеком. */
export function readCertificate(certPath, keyPath) {
  const cert = fs.readFileSync(certPath, 'utf8')
  const key = fs.readFileSync(keyPath, 'utf8')
  return { cert, key, fingerprint: inspect(cert).fingerprint, caCert: null, issued: false }
}

/** Прочитать Root CA сертификат, если он существует. */
export function readRootCA(dir) {
  if (!dir) return null
  const caCertPath = path.join(dir, 'lanmode-ca.pem')
  if (fs.existsSync(caCertPath)) {
    try {
      return fs.readFileSync(caCertPath, 'utf8')
    } catch (_) {
      return null
    }
  }
  return null
}
