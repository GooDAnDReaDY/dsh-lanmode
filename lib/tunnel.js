// Cloudflare Tunnels driver for remote WAN access without public IP (#46, #47, #48, #49, #50).
//
// Capabilities:
// - #46: Quick Tunnels (trycloudflare.com) and Named Tunnels (token) support
// - #47: Automatic public URL parsing from cloudflared output
// - #48: Integration with QR generator for instant smartphone login
// - #49: Dynamic tunnel start/stop via API without server restart
// - #50: Detection of inbound Cloudflare WAN traffic (CF-Connecting-IP, CF-Ray)

import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'

const QUICK_URL_REGEX = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/

export class CloudflareTunnel extends EventEmitter {
  constructor(options = {}) {
    super()
    this.port = options.port || 3088
    this.token = options.token || ''
    this.mode = options.mode || 'quick' // 'quick' | 'named'
    this.proc = null
    this.publicUrl = null
    this.status = 'stopped' // 'stopped' | 'starting' | 'active' | 'error'
    this.lastError = null
    this.log = options.log || (() => {})
  }

  /**
   * Start Cloudflare tunnel.
   * @param {object} [opts] Launch options
   * @returns {Promise<string>} Public URL
   */
  start(opts = {}) {
    if (opts.port) this.port = opts.port
    if (opts.token) this.token = opts.token
    if (opts.mode) this.mode = opts.mode

    if (this.status === 'active' && this.publicUrl) {
      return Promise.resolve(this.publicUrl)
    }

    this.stop()
    this.status = 'starting'
    this.lastError = null

    return new Promise((resolve, reject) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          this.status = 'error'
          this.lastError = 'Timeout obtaining Cloudflare public address'
          reject(new Error(this.lastError))
        }
      }, 30000)

      const args = (this.mode === 'named' && this.token)
        ? ['tunnel', 'run', '--token', this.token]
        : ['tunnel', '--url', `http://127.0.0.1:${this.port}`]

      try {
        this.proc = spawn('cloudflared', args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (err) {
        clearTimeout(timeout)
        this.status = 'error'
        this.lastError = 'Failed to launch cloudflared: ' + (err.message || err)
        return reject(new Error(this.lastError))
      }

      const onOutput = (chunk) => {
        const text = chunk.toString('utf8')
        // #47 Parse published public URL
        const match = text.match(QUICK_URL_REGEX)
        if (match && !this.publicUrl) {
          this.publicUrl = match[0]
          this.status = 'active'
          this.log(`Cloudflare WAN tunnel active: ${this.publicUrl}`)
          this.emit('active', this.publicUrl)
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            resolve(this.publicUrl)
          }
        }
      }

      this.proc.stdout.on('data', onOutput)
      this.proc.stderr.on('data', onOutput)

      this.proc.on('error', (err) => {
        this.status = 'error'
        this.lastError = err.message || String(err)
        this.emit('error', err)
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          reject(err)
        }
      })

      this.proc.on('exit', (code) => {
        const wasActive = this.status === 'active'
        this.status = 'stopped'
        this.publicUrl = null
        this.proc = null
        this.emit('stopped', code)
        if (!resolved && !wasActive) {
          resolved = true
          clearTimeout(timeout)
          reject(new Error(`cloudflared exited with code ${code}`))
        }
      })
    })
  }

  /**
   * Stop Cloudflare tunnel.
   */
  stop() {
    if (this.proc) {
      try {
        this.proc.kill('SIGTERM')
      } catch (err) {
        if (err && err.code !== 'ESRCH' && typeof this.log === 'function') {
          this.log('[tunnel] process kill error: ' + (err.message || err))
        }
      }
      this.proc = null
    }
    this.status = 'stopped'
    this.publicUrl = null
  }

  /**
   * Get current tunnel state.
   */
  getState() {
    return {
      status: this.status,
      publicUrl: this.publicUrl,
      mode: this.mode,
      lastError: this.lastError,
      active: this.status === 'active',
    }
  }
}

/**
 * Check if request originated from Cloudflare tunnel (#50).
 * @param {object} headers HTTP request headers
 * @returns {boolean}
 */
export function isCloudflareRequest(headers) {
  if (!headers) return false
  return Boolean(headers['cf-ray'] || headers['cf-connecting-ip'] || headers['cf-visitor'])
}
