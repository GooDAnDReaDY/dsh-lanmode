// Реестр сопряженных устройств и сессионный контроль (#51, #52, #53, #54).
//
// Возможности:
// - #51: Определение имени и платформы устройства по User-Agent
// - #52: Отслеживание активности в реальном времени (lastSeenAt, онлайн < 60с)
// - #53: Индивидуальный отзыв устройства
// - #54: Экстренное отключение всех сессий (Emergency Kill Switch)

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/**
 * Распознать платформу и браузер по User-Agent строке.
 * @param {string} ua User-Agent заголовок
 * @returns {{ name: string, os: string, browser: string }}
 */
export function parseUserAgent(ua = '') {
  const str = String(ua || '')
  let deviceOs = 'Unknown OS'
  let browser = 'Unknown Browser'

  // Определение OS
  if (/iPhone/i.test(str)) deviceOs = 'iPhone'
  else if (/iPad/i.test(str)) deviceOs = 'iPad'
  else if (/Android/i.test(str)) deviceOs = 'Android'
  else if (/Windows NT/i.test(str)) deviceOs = 'Windows'
  else if (/Macintosh|Mac OS X/i.test(str)) deviceOs = 'macOS'
  else if (/Linux/i.test(str)) deviceOs = 'Linux'

  // Определение браузера
  if (/Edg|Edge/i.test(str)) browser = 'Edge'
  else if (/Chrome|CriOS/i.test(str)) browser = 'Chrome'
  else if (/Safari/i.test(str) && !/Chrome/i.test(str)) browser = 'Safari'
  else if (/Firefox|FxiOS/i.test(str)) browser = 'Firefox'
  else if (/SamsungBrowser/i.test(str)) browser = 'Samsung Internet'

  const name = `${deviceOs} (${browser})`
  return { name, os: deviceOs, browser }
}

export class DeviceRegistry {
  constructor(filePath) {
    this.filePath = filePath || path.join(os.homedir(), '.dsh', 'dsh-lanmode-devices.json')
    /** @type {Map<string, object>} */
    this.devices = new Map()
    this.load()
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
        if (Array.isArray(raw)) {
          for (const dev of raw) {
            if (dev && dev.id) this.devices.set(dev.id, dev)
          }
        }
      }
    } catch (_) { /* файл создастся заново */ }
  }

  save() {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify([...this.devices.values()], null, 2), 'utf8')
    } catch (_) {}
  }

  /**
   * Зафиксировать активность устройства по токену и запросу.
   */
  touch(id, req) {
    if (!id) return
    const now = Date.now()
    let dev = this.devices.get(id)
    if (!dev) {
      const parsed = parseUserAgent(req.headers ? req.headers['user-agent'] : '')
      dev = {
        id,
        name: parsed.name,
        os: parsed.os,
        browser: parsed.browser,
        ip: req.socket ? req.socket.remoteAddress : '',
        createdAt: now,
        lastSeenAt: now,
        revoked: false,
      }
      this.devices.set(id, dev)
    } else {
      dev.lastSeenAt = now
      if (req.socket && req.socket.remoteAddress) dev.ip = req.socket.remoteAddress
    }
    this.save()
    return dev
  }

  isRevoked(id) {
    if (!id) return false
    const dev = this.devices.get(id)
    return Boolean(dev && dev.revoked)
  }

  revoke(id) {
    const dev = this.devices.get(id)
    if (dev) {
      dev.revoked = true
      this.save()
      return true
    }
    return false
  }

  revokeAll() {
    for (const dev of this.devices.values()) {
      dev.revoked = true
    }
    this.save()
    return true
  }

  list() {
    const now = Date.now()
    return [...this.devices.values()].map((d) => ({
      id: d.id,
      name: d.name,
      os: d.os,
      browser: d.browser,
      ip: d.ip,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
      online: (now - d.lastSeenAt) < 60000,
      revoked: d.revoked,
    }))
  }
}
