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
  constructor(entries = [], corrupted = false) {
    this.ips = new Set()
    this.corrupted = Boolean(corrupted)
    for (const item of entries || []) {
      const ip = normalizeIp(typeof item === 'string' ? item : item && item.ip)
      if (ip) this.ips.add(ip)
    }
  }

  has(ip) {
    if (this.corrupted && !isLoopbackAddress(ip)) return true
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

export function readBanFile(filePath, fsImpl = fs, log = null) {
  let hasMainFile = false
  try {
    if (!fsImpl.existsSync(filePath)) {
      const bakPath = `${filePath}.bak`
      if (fsImpl.existsSync(bakPath)) {
        const bakRaw = fsImpl.readFileSync(bakPath, 'utf8')
        const bakData = JSON.parse(bakRaw)
        if (!Array.isArray(bakData)) throw new Error('Malformed ban backup data: expected an array')
        return new BanList(bakData)
      }
      return new BanList()
    }
    hasMainFile = true
    const content = fsImpl.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)
    if (!Array.isArray(data)) throw new Error('Malformed ban data: expected an array')
    try {
      const bakTmp = `${filePath}.bak.tmp.${process.pid}.${Date.now()}`
      fsImpl.writeFileSync(bakTmp, content, 'utf8')
      fsImpl.renameSync(bakTmp, `${filePath}.bak`)
    } catch (_) {}
    return new BanList(data)
  } catch (err) {
    if (err && err.code === 'ENOENT') return new BanList()
    if (log && typeof log.error === 'function') {
      log.error(`Failed to load ban file: ${err?.message || err}`)
    } else {
      console.error(`Failed to load ban file: ${err?.message || err}`)
    }
  }

  if (hasMainFile) {
    try {
      const bakPath = `${filePath}.bak`
      if (fsImpl.existsSync(bakPath)) {
        const bakData = JSON.parse(fsImpl.readFileSync(bakPath, 'utf8'))
        if (!Array.isArray(bakData)) throw new Error('Malformed ban backup: expected an array')
        return new BanList(bakData)
      }
    } catch (bakErr) {
      if (log && typeof log.error === 'function') {
        log.error(`Failed to load ban backup: ${bakErr?.message || bakErr}`)
      } else {
        console.error(`Failed to load ban backup: ${bakErr?.message || bakErr}`)
      }
    }
    return new BanList([], true)
  }
  return new BanList()
}

export function writeBanFile(filePath, list, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
  const body = JSON.stringify(list && typeof list.toJSON === 'function' ? list.toJSON() : [])
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`
  fsImpl.writeFileSync(tmpPath, body, 'utf8')
  fsImpl.renameSync(tmpPath, filePath)
  try {
    const bakTmp = `${filePath}.bak.tmp.${process.pid}.${Date.now()}`
    fsImpl.writeFileSync(bakTmp, body, 'utf8')
    fsImpl.renameSync(bakTmp, `${filePath}.bak`)
  } catch (_) {}
}
