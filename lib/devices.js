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
import crypto from 'node:crypto'

/**
 * Hash a device/session token for at-rest storage (Issue #266).
 * @param {string} token
 * @returns {string}
 */
export function hashToken(token) {
  if (!token || typeof token !== 'string') return ''
  return crypto.createHash('sha256').update(token).digest('hex')
}

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

export function getDshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

export function getDefaultDevicesFilePath() {
  return path.join(getDshHome(), 'dsh-lanmode-devices.json')
}

export class DeviceRegistry {
  constructor(filePathOrOptions, options = {}) {
    let resolvedPath = ''
    let resolvedOptions = options
    if (filePathOrOptions && typeof filePathOrOptions === 'object') {
      resolvedPath = filePathOrOptions.filePath || ''
      resolvedOptions = filePathOrOptions
    } else if (typeof filePathOrOptions === 'string') {
      resolvedPath = filePathOrOptions
    }
    this.filePath = resolvedPath || getDefaultDevicesFilePath()
    /** @type {Map<string, object>} */
    this.devices = new Map()
    /** @type {Set<string>} */
    this.revoked = new Set()
    this._saveTimer = null
    this._saveDelayMs = resolvedOptions.saveDelayMs ?? 5000
    this.log = resolvedOptions.log || null
    this._isDirty = false
    this.load()
  }

  load() {
    try {
      if (typeof this.filePath === 'string' && fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
        if (Array.isArray(raw)) {
          for (const dev of raw) {
            if (dev && dev.id) {
              if (!dev.platform) {
                const parsed = parseUserAgent(dev.userAgent || '')
                dev.platform = parsed.platform
                dev.icon = parsed.icon
              }
              if (dev.revoked) {
                this.revoked.add(dev.id)
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
    if (!this._isDirty) return true
    return this.save()
  }

  /**
   * Schedule debounced disk write to protect Event Loop under frequent requests.
   */
  scheduleSave() {
    this._isDirty = true
    if (this._saveTimer) return
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null
      const ok = this.save()
      if (!ok && this._isDirty) {
        this.scheduleSave()
      }
    }, this._saveDelayMs)
    if (this._saveTimer.unref) this._saveTimer.unref()
  }

  save() {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const tmpPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}`
      const diskList = [...this.devices.values()].map((d) => ({
        ...d,
        id: hashToken(d.id),
      }))
      fs.writeFileSync(tmpPath, JSON.stringify(diskList, null, 2), { encoding: 'utf8', mode: 0o600 })
      try { fs.chmodSync(tmpPath, 0o600) } catch (err) { /* bestEffort */ void err }
      fs.renameSync(tmpPath, this.filePath)
      try { fs.chmodSync(this.filePath, 0o600) } catch (err) { /* bestEffort */ void err }
      this._isDirty = false
      return true
    } catch (err) {
      this._isDirty = true
      if (this.log && typeof this.log.error === 'function') {
        this.log.error('Failed to save devices file: ' + (err && err.message ? err.message : String(err)))
      }
      return false
    }
  }

  /**
   * Record client activity for device ID.
   */
  touch(id, req) {
    if (!id) return
    const now = Date.now()
    const isRevoked = this.revoked.has(id) || this.revoked.has(hashToken(id))
    let dev = this.devices.get(id) || this.devices.get(hashToken(id))
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
        revoked: isRevoked,
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
      if (isRevoked) dev.revoked = true
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
    const dev = this.devices.get(id) || this.devices.get(hashToken(id))
    if (!dev) return false
    const prevNickname = dev.nickname
    dev.nickname = String(nickname || '').trim().slice(0, 64)
    this._isDirty = true
    const ok = this.flush()
    if (ok === false) {
      dev.nickname = prevNickname
      return false
    }
    return true
  }

  isRevoked(id) {
    if (!id) return false
    if (this.revoked.has(id) || this.revoked.has(hashToken(id))) return true
    const dev = this.devices.get(id) || this.devices.get(hashToken(id))
    return Boolean(dev && dev.revoked)
  }

  revoke(id) {
    if (!id) return false
    this.revoked.add(id)
    this.revoked.add(hashToken(id))
    const dev = this.devices.get(id) || this.devices.get(hashToken(id))
    if (dev) dev.revoked = true
    this._isDirty = true
    return this.flush() === true
  }

  revokeAll() {
    for (const dev of this.devices.values()) {
      this.revoked.add(dev.id)
      this.revoked.add(hashToken(dev.id))
      dev.revoked = true
    }
    this._isDirty = true
    return this.flush() === true
  }

  revokeAllExcept(currentId) {
    for (const dev of this.devices.values()) {
      if (dev.id !== currentId && hashToken(dev.id) !== currentId) {
        this.revoked.add(dev.id)
        this.revoked.add(hashToken(dev.id))
        dev.revoked = true
      }
    }
    this._isDirty = true
    return this.flush() === true
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
