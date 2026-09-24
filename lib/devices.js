// Connected devices registry and session management.
//
// Capabilities:
// - User-Agent parsing for device platform and browser identification
// - Real-time activity tracking (lastSeenAt, online status)
// - Custom device nickname management and persistence
// - Platform indicator detection (ios, android, macos, windows, linux)
// - Individual device token revocation
// - Emergency Kill Switch (revoke all / revoke all except current)
// Zero hardcoded Cyrillic characters.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/**
 * Identify client device OS, browser and standardized platform from User-Agent string.
 * @param {string} ua User-Agent header
 * @returns {{ name: string, os: string, browser: string, platform: string, icon: string }}
 */
export function parseUserAgent(ua = '') {
  const str = String(ua || '')
  let deviceOs = 'Unknown OS'
  let browser = 'Unknown Browser'
  let platform = 'unknown'
  let icon = 'server'
  let model = ''

  if (/iPhone/i.test(str)) {
    deviceOs = 'iPhone'
    platform = 'ios'
    icon = 'mobile'
    const ios = str.match(/iPhone OS (\d+)[._](\d+)/i) || str.match(/OS (\d+)[._](\d+)/i)
    if (ios) model = 'iOS ' + ios[1]
  } else if (/iPad/i.test(str)) {
    deviceOs = 'iPad'
    platform = 'ios'
    icon = 'tablet'
    const ios = str.match(/OS (\d+)[._](\d+)/i)
    if (ios) model = 'iPadOS ' + ios[1]
  } else if (/Android/i.test(str)) {
    deviceOs = 'Android'
    platform = 'android'
    icon = /Mobile/i.test(str) ? 'mobile' : 'tablet'
    const androidModel = str.match(/Android [^;]*;\s*([^;)]+?)\s*(?:Build\/|\))/i)
    if (androidModel) {
      const raw = androidModel[1].trim()
      if (raw && !/^wv$/i.test(raw) && !/^Linux$/i.test(raw)) model = raw
    }
  } else if (/Windows NT/i.test(str)) {
    deviceOs = 'Windows'
    platform = 'windows'
    icon = 'desktop'
  } else if (/Macintosh|Mac OS X/i.test(str)) {
    deviceOs = 'macOS'
    platform = 'macos'
    icon = 'desktop'
  } else if (/Linux/i.test(str)) {
    deviceOs = 'Linux'
    platform = 'linux'
    icon = 'desktop'
  }

  if (/Edg|Edge/i.test(str)) browser = 'Edge'
  else if (/SamsungBrowser/i.test(str)) browser = 'Samsung Internet'
  else if (/Chrome|CriOS/i.test(str)) browser = 'Chrome'
  else if (/Firefox|FxiOS/i.test(str)) browser = 'Firefox'
  else if (/Safari/i.test(str) && !/Chrome/i.test(str)) browser = 'Safari'

  const head = model && deviceOs !== 'Unknown OS' && !model.startsWith(deviceOs)
    ? deviceOs + ' ' + model
    : (model || deviceOs)
  const name = browser && browser !== 'Unknown Browser'
    ? head + ' \u00b7 ' + browser
    : head
  return { name, os: deviceOs, browser, platform, icon, model }
}

export class DeviceRegistry {
  constructor(filePath, options = {}) {
    this.filePath = filePath || path.join(os.homedir(), '.dsh', 'dsh-lanmode-devices.json')
    /** @type {Map<string, object>} */
    this.devices = new Map()
    this._saveTimer = null
    this._saveDelayMs = options.saveDelayMs ?? 5000
    this._isDirty = false
    this.load()
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
        if (Array.isArray(raw)) {
          for (const dev of raw) {
            if (dev && dev.id) {
              if (!dev.platform) {
                const parsed = parseUserAgent(dev.userAgent || '')
                dev.platform = parsed.platform
                dev.icon = parsed.icon
              }
              this.devices.set(dev.id, dev)
            }
          }
        }
      }
    } catch (_) { /* Recreate file on next write */ }
  }

  /**
   * Flush pending debounced writes to disk immediately.
   */
  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }
    if (!this._isDirty) return
    this.save()
  }

  /**
   * Schedule debounced disk write to protect Event Loop under frequent requests.
   */
  scheduleSave() {
    this._isDirty = true
    if (this._saveTimer) return
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null
      this.save()
    }, this._saveDelayMs)
    if (this._saveTimer.unref) this._saveTimer.unref()
  }

  save() {
    this._isDirty = false
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify([...this.devices.values()], null, 2), 'utf8')
    } catch (err) { /* bestEffort */ void err }
  }

  /**
   * Record client activity for device ID.
   */
  touch(id, req) {
    if (!id) return
    const now = Date.now()
    let dev = this.devices.get(id)
    const ua = req && req.headers ? req.headers['user-agent'] : ''
    if (!dev) {
      const parsed = parseUserAgent(ua)
      dev = {
        id,
        name: parsed.name,
        nickname: '',
        os: parsed.os,
        browser: parsed.browser,
        platform: parsed.platform,
        icon: parsed.icon,
        userAgent: ua,
        ip: req && req.socket ? req.socket.remoteAddress : '',
        createdAt: now,
        lastSeenAt: now,
        revoked: false,
      }
      this.devices.set(id, dev)
      if (this.devices.size > 200) {
        const entries = [...this.devices.entries()].sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt)
        while (this.devices.size > 200 && entries.length > 0) {
          const [oldId] = entries.shift()
          this.devices.delete(oldId)
        }
      }
    } else {
      dev.lastSeenAt = now
      if (ua && !dev.userAgent) dev.userAgent = ua
      if (!dev.platform) {
        const parsed = parseUserAgent(ua || dev.userAgent || '')
        dev.platform = parsed.platform
        dev.icon = parsed.icon
      }
      if (req && req.socket && req.socket.remoteAddress) dev.ip = req.socket.remoteAddress
    }
    this.scheduleSave()
    return dev
  }

  /**
   * Set custom nickname for a device.
   * @param {string} id Device ID
   * @param {string} nickname Custom friendly name
   * @returns {boolean}
   */
  setNickname(id, nickname) {
    if (!id) return false
    const dev = this.devices.get(id)
    if (!dev) return false
    dev.nickname = String(nickname || '').trim().slice(0, 64)
    this._isDirty = true
    this.flush()
    return true
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
      this._isDirty = true
      this.flush()
      return true
    }
    return false
  }

  revokeAll() {
    for (const dev of this.devices.values()) {
      dev.revoked = true
    }
    this._isDirty = true
    this.flush()
    return true
  }

  revokeAllExcept(currentId) {
    for (const dev of this.devices.values()) {
      if (dev.id !== currentId) {
        dev.revoked = true
      }
    }
    this._isDirty = true
    this.flush()
    return true
  }

  list() {
    const now = Date.now()
    return [...this.devices.values()].map((d) => ({
      id: d.id,
      name: d.name,
      nickname: d.nickname || '',
      os: d.os,
      browser: d.browser,
      platform: d.platform || 'unknown',
      icon: d.icon || 'desktop',
      ip: d.ip,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
      online: (now - d.lastSeenAt) < 60000,
      revoked: d.revoked,
    }))
  }
}
