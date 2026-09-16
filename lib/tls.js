// TLS certificate provisioning and local Root CA generation.
//
// Browsers require a secure context (HTTPS) for microphone, speech recognition,
// clipboard access, and PWA capabilities.
//
// Automatically manages:
// 1. Local Root Certificate Authority (10-year lifetime) - lanmode-ca.pem
// 2. Server certificate signed by the Root CA with SAN covering dsh.local, all network IPs, and localhost
// 3. Apple Configuration Profile (.mobileconfig) for one-tap iOS/iPadOS certificate trust

import { execFile } from 'node:child_process'
import { X509Certificate, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { addressBytes } from './access.js'

/** How long before expiration to renew the server certificate (30 days). */
const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000

/** Server certificate lifetime in days. */
const LIFETIME_DAYS = 397

/** Root CA certificate lifetime in days (10 years). */
const CA_LIFETIME_DAYS = 3650

const EPHEMERAL_INTERFACE = /^(veth|br-|docker|virbr)/i

function linkLocal(address) {
  return /^fe80:/i.test(address) || /^169\.254\./.test(address)
}

/** Check if running inside Windows Subsystem for Linux (WSL). */
export function isWsl() {
  try {
    if (process.platform !== 'linux') return false
    const ver = fs.readFileSync('/proc/version', 'utf8').toLowerCase()
    return ver.includes('microsoft') || ver.includes('wsl')
  } catch (_) { return false }
}

/** Retrieve physical Windows host IP when running in WSL2. */
export function wslHostAddress() {
  try {
    if (!isWsl()) return null
    const conf = fs.readFileSync('/etc/resolv.conf', 'utf8')
    const match = conf.match(/nameserver\s+([0-9.]+)/)
    return match ? match[1] : null
  } catch (_) { return null }
}

/** Check if IP address belongs to Tailscale CGNAT subnet 100.64.0.0/10. */
export function isTailscaleAddress(ip) {
  if (!ip || !ip.startsWith('100.')) return false
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  const second = parseInt(parts[1], 10)
  return second >= 64 && second <= 127
}

/** Collect hostnames and IP addresses to include in the TLS certificate SAN. */
export function localAddresses(extra = []) {
  const extraList = Array.isArray(extra) ? extra : (extra ? [extra] : [])
  const found = new Set(['localhost', '127.0.0.1', '::1', 'dsh.local', ...extraList])
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

  const wslHost = wslHostAddress()
  if (wslHost) found.add(wslHost)

  return [...found]
}

/** Format Subject Alternative Names (SAN) string for OpenSSL. */
export function altNames(hosts) {
  const parts = []
  for (const host of hosts) {
    let clean = String(host ?? '').trim()
    if (!clean) continue
    clean = clean.replace(/^[\[\]]/g, '')
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

/** Verify openssl CLI availability. */
export async function checkOpenSsl() {
  try {
    const version = await run('openssl', ['version'])
    return { available: true, version: version.trim() }
  } catch (err) {
    return { available: false, error: String(err.message || err) }
  }
}

/** Extract certificate expiration, SHA-256 fingerprint, and SAN names. */
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

/** Ensure local Root CA exists and is valid. */
function safeChmod(targetPath, mode, log) {
  try {
    fs.chmodSync(targetPath, mode)
  } catch (err) {
    // Intentional non-fatal fallback on non-POSIX or restricted filesystems
    if (typeof log === 'function') {
      log(`chmod ${mode.toString(8)} on ${targetPath} skipped: ${err?.message || err}`)
    }
  }
}

function safeUnlink(targetPath, log) {
  try {
    fs.unlinkSync(targetPath)
  } catch (err) {
    if (err?.code !== 'ENOENT' && typeof log === 'function') {
      log(`unlink ${targetPath} skipped: ${err?.message || err}`)
    }
  }
}

async function ensureRootCA(dir, log) {
  const caKeyPath = path.join(dir, 'lanmode-ca-key.pem')
  const caCertPath = path.join(dir, 'lanmode-ca.crt')

  if (fs.existsSync(caKeyPath) && fs.existsSync(caCertPath)) {
    try {
      const caCert = fs.readFileSync(caCertPath, 'utf8')
      const info = inspect(caCert)
      if (info.expires > Date.now() + 30 * 86400 * 1000) {
        return { caCertPath, caKeyPath, caCert, fingerprint: info.fingerprint }
      }
      log('Root CA certificate is nearing expiration; generating new CA...')
    } catch (unreadable) {
      log('Existing Root CA unreadable, reissuing: ' + String(unreadable.message || unreadable))
    }
  }

  log('generating dsh-lanmode Local Root CA (10-year validity)...')
  await run('openssl', [
    'req', '-x509', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256',
    '-days', String(CA_LIFETIME_DAYS),
    '-keyout', caKeyPath,
    '-out', caCertPath,
    '-subj', '/CN=dsh-lanmode Local Root CA',
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
  ])
  safeChmod(caKeyPath, 0o600, log)

  const caCert = fs.readFileSync(caCertPath, 'utf8')
  return { caCertPath, caKeyPath, caCert, fingerprint: inspect(caCert).fingerprint }
}

/**
 * Retrieve cached TLS certificate or issue a new CA + server certificate pair.
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

  fs.mkdirSync(dir, { recursive: true })

  let caInfo = null
  try {
    caInfo = await ensureRootCA(dir, options.log)
  } catch (err) {
    options.log('Root CA generation error: ' + (err.message || err))
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
      options.log('server certificate renewing: expiring or does not cover all host addresses')
    } catch (unreadable) {
      options.log('certificate unreadable, reissuing: ' + String(unreadable.message || unreadable))
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
      safeChmod(keyPath, 0o600, options.log)

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

      safeUnlink(csrPath, options.log)

      const cert = fs.readFileSync(certPath, 'utf8')
      return {
        cert,
        key: fs.readFileSync(keyPath, 'utf8'),
        fingerprint: inspect(cert).fingerprint,
        caCert: caInfo.caCert,
        issued: true,
      }
    } catch (signErr) {
      options.log('CA signing error (' + (signErr.message || signErr) + '), falling back to self-signed')
    }
  }

  // Fallback to standalone self-signed
  await run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256',
    '-days', String(LIFETIME_DAYS),
    '-keyout', keyPath,
    '-out', certPath,
    '-subj', '/CN=' + (hosts[0] || 'dsh.local'),
    '-addext', 'subjectAltName=' + san,
  ])
  safeChmod(keyPath, 0o600, options.log)

  const cert = fs.readFileSync(certPath, 'utf8')
  return {
    cert,
    key: fs.readFileSync(keyPath, 'utf8'),
    fingerprint: inspect(cert).fingerprint,
    caCert: caInfo?.caCert ?? null,
    issued: true,
  }
}

/** Read user-provided certificate and private key. */
export function readCertificate(certPath, keyPath) {
  const cert = fs.readFileSync(certPath, 'utf8')
  const key = fs.readFileSync(keyPath, 'utf8')
  return { cert, key, fingerprint: inspect(cert).fingerprint, caCert: null, issued: false }
}

/** Read Root CA certificate if it exists. */
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

/**
 * Generate Apple Configuration Profile (.mobileconfig) for one-tap iOS/iPadOS certificate installation.
 *
 * @param {string} caCertPem PEM certificate string
 * @param {string} [displayName] Profile display name
 * @returns {string} XML plist payload
 */
export function generateAppleMobileConfig(caCertPem, displayName = 'DeepSeek Harness Local Root CA') {
  if (!caCertPem) return ''
  const base64Body = caCertPem
    .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
    .replace(/\s+/g, '')

  const profileUuid = '8A44C120-2E24-4B28-854E-7C5F352E4AA1'
  const payloadUuid = '4F11E58A-69A2-4D90-9512-E577A82936CB'

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadCertificateFileName</key>
            <string>dsh-root-ca.crt</string>
            <key>PayloadContent</key>
            <data>
${base64Body}
            </data>
            <key>PayloadDescription</key>
            <string>Root CA certificate for DeepSeek Harness secure LAN access.</string>
            <key>PayloadDisplayName</key>
            <string>${displayName}</string>
            <key>PayloadIdentifier</key>
            <string>app.goodandready.dsh.lanmode.ca-cert</string>
            <key>PayloadType</key>
            <string>com.apple.security.root</string>
            <key>PayloadUUID</key>
            <string>${payloadUuid}</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
        </dict>
    </array>
    <key>PayloadDescription</key>
    <string>Configuration profile to trust DeepSeek Harness Local Root CA for HTTPS.</string>
    <key>PayloadDisplayName</key>
    <string>${displayName}</string>
    <key>PayloadIdentifier</key>
    <string>app.goodandready.dsh.lanmode.profile</string>
    <key>PayloadOrganization</key>
    <string>GoodAndReady</string>
    <key>PayloadRemovalDisallowed</key>
    <false/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>${profileUuid}</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>
`
}
