// Сертификат для прямого режима.
//
// Зачем вообще. Микрофон браузер отдаёт только на защищённом соединении, и это
// единственное, чего не лечит подмена на странице: `navigator.mediaDevices`
// подделать нечем — за ним настоящее устройство. Пока прямой режим слушает
// голый HTTP, голосовой ввод по сети невозможен в принципе.
//
// Самоподписанный сертификат — компромисс, а не решение: браузер всё равно
// спросит. Но он превращает «невозможно» в «подтвердить один раз», а это
// разница между «не работает» и «работает».
//
// Сертификат делается через openssl. Node умеет породить ключевую пару, но не
// собрать из неё X.509: это ASN.1 вручную, сотни строк ради того, что уже
// лежит в /usr/bin. Нет openssl — честно говорим об этом и предлагаем свой
// сертификат, а не делаем вид, что всё в порядке.

import { execFile } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { addressBytes } from './access.js'

/** За сколько до истечения перевыпускать. */
const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000

/** Сколько живёт выпущенный нами сертификат. */
const LIFETIME_DAYS = 397

/**
 * Адреса, по которым к этой машине могут обратиться.
 *
 * В сертификат идут все: браузер сверяет тот адрес, который набрали в строке,
 * и сертификат, выписанный на одно имя, ругается на все остальные — даже после
 * того, как его один раз приняли.
 */
export function localAddresses() {
  const found = new Set(['localhost', '127.0.0.1', '::1'])
  const interfaces = os.networkInterfaces()
  for (const list of Object.values(interfaces)) {
    for (const item of list ?? []) {
      if (!item || item.internal) continue
      if (item.address) found.add(item.address)
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

/** Что известно о лежащем сертификате: до какого числа и на какие имена. */
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
  }
}

/**
 * Годится ли лежащий сертификат: не истекает ли и покрывает ли нужные адреса.
 *
 * Второе важнее первого. Появился новый сетевой адрес — старый сертификат
 * формально жив, но по новому адресу браузер его не примет, и человек будет
 * гадать, почему «вчера работало».
 */
/**
 * Одно и то же имя, записанное одинаково.
 *
 * Адрес можно записать по-разному: openssl превращает  в
 * , и сравнение строк на этом рассыпается. Молча, с
 * единственным следствием: сертификат перевыпускается при каждом запуске, а
 * браузер каждый раз требует подтверждения заново — то есть смысл затеи
 * пропадает.
 */
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
 * Взять готовый сертификат или выпустить новый.
 *
 * @param options {{dir: string, hosts: string[], log: (message: string) => void, now?: number}}
 * @returns `{ cert, key, fingerprint, issued }`
 */
export async function ensureCertificate(options) {
  const dir = options.dir
  const hosts = options.hosts
  const now = options.now ?? Date.now()
  const certPath = path.join(dir, 'lanmode-cert.pem')
  const keyPath = path.join(dir, 'lanmode-key.pem')

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    try {
      const cert = fs.readFileSync(certPath, 'utf8')
      const info = inspect(cert)
      if (stillGood(info, hosts, now)) {
        return {
          cert,
          key: fs.readFileSync(keyPath, 'utf8'),
          fingerprint: info.fingerprint,
          issued: false,
        }
      }
      options.log('сертификат перевыпускается: истекает или не покрывает все адреса')
    } catch (unreadable) {
      options.log('сертификат нечитаем, выпускаю заново: ' + String(unreadable.message || unreadable))
    }
  }

  fs.mkdirSync(dir, { recursive: true })
  await run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256',
    '-days', String(LIFETIME_DAYS),
    '-keyout', keyPath,
    '-out', certPath,
    '-subj', '/CN=' + (hosts[0] || 'localhost'),
    '-addext', 'subjectAltName=' + altNames(hosts),
  ])
  // Ключ читаем не только мы: пусть его не читает никто, кроме владельца.
  fs.chmodSync(keyPath, 0o600)

  const cert = fs.readFileSync(certPath, 'utf8')
  return {
    cert,
    key: fs.readFileSync(keyPath, 'utf8'),
    fingerprint: inspect(cert).fingerprint,
    issued: true,
  }
}

/** Прочитать сертификат и ключ, указанные человеком. */
export function readCertificate(certPath, keyPath) {
  const cert = fs.readFileSync(certPath, 'utf8')
  const key = fs.readFileSync(keyPath, 'utf8')
  return { cert, key, fingerprint: inspect(cert).fingerprint, issued: false }
}
