import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const VAPID_PUBLIC_ENV = 'DSH_LANMODE_VAPID_PUBLIC_KEY'
export const VAPID_PRIVATE_ENV = 'DSH_LANMODE_VAPID_PRIVATE_KEY'

export function generateVapidKeys() {
  const e = crypto.createECDH('prime256v1')
  e.generateKeys()
  return { publicKey: e.getPublicKey('base64url'), privateKey: e.getPrivateKey('base64url') }
}

export function resolveVapidKeys(opts = {}) {
  const ep = process.env[VAPID_PUBLIC_ENV], ev = process.env[VAPID_PRIVATE_ENV]
  if (ep && ev) return { publicKey: ep.trim(), privateKey: ev.trim() }
  const fp = opts.filePath || path.join(os.homedir(), '.dsh', 'dsh-lanmode-vapid.json')
  try {
    if (fs.existsSync(fp)) {
      const p = JSON.parse(fs.readFileSync(fp, 'utf8'))
      if (p?.publicKey && p?.privateKey) return { publicKey: p.publicKey, privateKey: p.privateKey }
    }
  } catch {}
  const k = generateVapidKeys()
  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(k, null, 2), { mode: 0o600, encoding: 'utf8' })
    fs.renameSync(tmp, fp)
  } catch {}
  return k
}

export function signVapidToken(aud, keys, sub = 'mailto:admin@localhost') {
  const exp = Math.floor(Date.now() / 1000) + 43200
  const u = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.' + Buffer.from(JSON.stringify({ aud, exp, sub })).toString('base64url')
  const raw = Buffer.from(keys.publicKey, 'base64url')
  const pk = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33, 65).toString('base64url') },
    format: 'jwk',
  })
  const s = crypto.createSign('SHA256')
  s.update(u)
  return `${u}.${s.sign({ key: pk, dsaEncoding: 'ieee-p1363' }, 'base64url')}`
}

export function encryptWebPushPayload(clientPub, clientAuth, text) {
  const cPub = Buffer.from(clientPub, 'base64url'), cAuth = Buffer.from(clientAuth, 'base64url')
  const sEcdh = crypto.createECDH('prime256v1')
  sEcdh.generateKeys()
  const sPub = sEcdh.getPublicKey()
  const sec = sEcdh.computeSecret(cPub)
  const info = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), cPub, sPub])
  const ikm = crypto.hkdfSync('sha256', sec, cAuth, info, 32)
  const salt = crypto.randomBytes(16)
  const cek = crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16)
  const nonce = crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12)
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const ct = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from([2])])), cipher.final()])
  const rs = Buffer.alloc(4)
  rs.writeUInt32BE(4096, 0)
  return Buffer.concat([salt, rs, Buffer.from([sPub.length]), sPub, ct, cipher.getAuthTag()])
}

export async function sendWebPush(sub, payload, keys, opts = {}) {
  const url = new URL(sub.endpoint)
  const token = signVapidToken(`${url.protocol}//${url.host}`, keys, opts.subject)
  let body = null
  const headers = { TTL: String(opts.ttl || 60), Urgency: opts.urgency || 'high', Authorization: `vapid t=${token}, k=${keys.publicKey}` }
  if (payload && sub.keys?.p256dh && sub.keys?.auth) {
    body = encryptWebPushPayload(sub.keys.p256dh, sub.keys.auth, typeof payload === 'string' ? payload : JSON.stringify(payload))
    headers['Content-Type'] = 'application/octet-stream'
    headers['Content-Encoding'] = 'aes128gcm'
  } else {
    headers['Content-Length'] = '0'
  }
  const res = await fetch(sub.endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(opts.timeout || 8000) })
  return { ok: res.ok, status: res.status, statusText: res.statusText, expired: res.status === 404 || res.status === 410 }
}

export class WebPushManager {
  constructor(opts = {}) {
    this.deviceRegistry = opts.deviceRegistry
    this.dshHome = opts.dshHome || os.homedir()
    this.log = opts.log
    this.vapidKeys = null
    this.vapidPath = path.join(this.dshHome, 'dsh-lanmode-vapid.json')
  }
  getVapidKeys() {
    if (!this.vapidKeys) this.vapidKeys = resolveVapidKeys({ filePath: this.vapidPath, log: this.log })
    return this.vapidKeys
  }
  getPublicKey() {
    return this.getVapidKeys().publicKey
  }
  async broadcastNotification(notif) {
    if (!this.deviceRegistry) return { sent: 0, failed: 0 }
    const subs = this.deviceRegistry.getPushSubscriptions()
    if (!subs?.length) return { sent: 0, failed: 0 }
    const keys = this.getVapidKeys()
    let sent = 0, failed = 0
    for (const sub of subs) {
      try {
        const res = await sendWebPush(sub, notif, keys)
        if (res.ok) sent++
        else {
          failed++
          if (res.expired) this.deviceRegistry.removePushSubscription(sub.endpoint)
        }
      } catch {
        failed++
      }
    }
    return { sent, failed }
  }
}

export function initPushManager(ctx, opts = {}) {
  const manager = new WebPushManager(opts)
  if (ctx?.on) {
    ctx.on('turn/end', () => manager.broadcastNotification({ title: 'DeepSeek Harness', body: 'Agent completed response', tag: 'dsh-turn-end', data: { url: '/' } }).catch(() => {}))
    ctx.on('approval/asked', (e) => manager.broadcastNotification({ title: 'DeepSeek Harness', body: (e?.toolName ? `Tool: ${e.toolName}` : 'Confirmation required'), tag: 'dsh-approval', data: { url: '/' } }).catch(() => {}))
  }
  return manager
}