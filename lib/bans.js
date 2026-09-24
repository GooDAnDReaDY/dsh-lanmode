// IP bans checked before login and session lookup.

import fs from 'node:fs'
import path from 'node:path'
import { isLoopbackAddress } from './access.js'

export const SELF_LOCK = 'SELF_LOCK'

export function normalizeIp(ip) {
  const raw = String(ip || '').trim()
  if (raw.startsWith('::ffff:')) return raw.slice('::ffff:'.length)
  return raw
}

export function banRefusal(ip, actorIp) {
  const target = normalizeIp(ip)
  if (!target) return 'MISSING'
  if (isLoopbackAddress(ip) || isLoopbackAddress(target)) return 'LOOPBACK'
  if (normalizeIp(actorIp) && normalizeIp(actorIp) === target) return SELF_LOCK
  return ''
}

export class BanList {
  constructor(entries = []) {
    this.ips = new Set()
    for (const item of entries || []) {
      const ip = normalizeIp(typeof item === 'string' ? item : item && item.ip)
      if (ip) this.ips.add(ip)
    }
  }

  has(ip) {
    return this.ips.has(normalizeIp(ip))
  }

  ban(ip, actorIp) {
    const reason = banRefusal(ip, actorIp)
    if (reason) {
      const err = new Error(reason)
      err.code = reason
      throw err
    }
    this.ips.add(normalizeIp(ip))
    return true
  }

  toJSON() {
    return [...this.ips]
  }
}

export function rejectBanned(res, list, ip) {
  if (!list || typeof list.has !== 'function' || !list.has(ip)) return false
  res.writeHead(403, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end('Forbidden')
  return true
}

export function readBanFile(filePath, fsImpl = fs) {
  try {
    const data = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'))
    return new BanList(Array.isArray(data) ? data : [])
  } catch {
    return new BanList()
  }
}

export function writeBanFile(filePath, list, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  const body = JSON.stringify(list && typeof list.toJSON === 'function' ? list.toJSON() : [])
  fsImpl.writeFileSync(filePath, body, 'utf8')
}
