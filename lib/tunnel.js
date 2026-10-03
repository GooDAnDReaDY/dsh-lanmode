// Cloudflare Tunnels driver for remote WAN access without public IP (#46, #47, #48, #49, #50, #343, #372, #373).
//
// Capabilities:
// - #46: Quick Tunnels (trycloudflare.com) and Named Tunnels (token) support
// - #47: Automatic public URL parsing from cloudflared output
// - #48: Integration with QR generator for instant smartphone login
// - #49: Dynamic tunnel start/stop via API without server restart
// - #50: Detection of inbound Cloudflare WAN traffic (CF-Connecting-IP, CF-Ray)
// - #343: Process lifecycle isolation and clean timeout management
// - #372: Fail-safe child process error handling without crashing host
// - #373: Full HTTPS origin support with custom CA and originServerName

import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { isTrustedProxy, DEFAULT_TRUSTED_PROXY_CIDRS } from './bridge-utils.js'

const QUICK_URL_REGEX = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/
const NAMED_READY_REGEX = /Registered tunnel connection|Connection [a-f0-9-]+ registered|Updated to new configuration/i

export class CloudflareTunnel extends EventEmitter {
  constructor(options = {}) {
    super()
    this.port = options.port || 3088
    this.token = options.token || ''
    this.mode = options.mode || 'quick' // 'quick' | 'named'
    this.hostname = options.hostname || null
    this.scheme = options.scheme || 'http' // 'http' | 'https'
    this.originServerName = options.originServerName || null
    this.caPool = options.caPool || null
    this.proc = null
    this.publicUrl = null
    this.status = 'stopped' // 'stopped' | 'starting' | 'active' | 'error'
    this.lastError = null
    this.log = options.log || (() => {})
    this._startTimeout = null
    this._stopping = false

    // #372 Register safe default error listener so emit('error') never throws unhandled
    this.on('error', (err) => {
      if (typeof this.log === 'function') {
        this.log('[tunnel] Handled error event: ' + (err?.message || err))
      }
    })
  }

  /**
   * Build cloudflared command line arguments.
   * @param {object} [opts] Options
   * @returns {string[]} Argument list
   */
  buildArgs(opts = {}) {
    const mode = opts.mode || this.mode
    const token = opts.token || this.token
    if (mode === 'named' && token) {
      return ['tunnel', 'run', '--token', token]
    }
    const scheme = (opts.scheme || this.scheme) === 'https' ? 'https' : 'http'
    const port = opts.port || this.port
    const args = ['tunnel', '--url', `${scheme}://127.0.0.1:${port}`]
    if (scheme === 'https') {
      // #373 Support HTTPS origin: pass origin-server-name and ca-pool for TLS verification
      const serverName = opts.originServerName || this.originServerName || 'dsh.local'
      args.push('--origin-server-name', serverName)
      const caPool = opts.caPool !== undefined ? opts.caPool : this.caPool
      if (caPool) {
        args.push('--origin-ca-pool', caPool)
      }
    }
    return args
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
    if (opts.hostname !== undefined) this.hostname = opts.hostname
    if (opts.scheme) this.scheme = opts.scheme
    if (opts.originServerName !== undefined) this.originServerName = opts.originServerName
    if (opts.caPool !== undefined) this.caPool = opts.caPool

    if (this.status === 'active' && this.publicUrl) {
      return Promise.resolve(this.publicUrl)
    }

    this.stop()
    this._stopping = false
    this.status = 'starting'
    this.lastError = null

    return new Promise((resolve, reject) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved && this.proc === currentProc) {
          resolved = true
          this._startTimeout = null
          this.status = 'error'
          this.lastError = 'Timeout obtaining Cloudflare public address'
          reject(new Error(this.lastError))
        }
      }, 30000)
      this._startTimeout = timeout

      const args = this.buildArgs(opts)

      let currentProc = null
      try {
        currentProc = spawn('cloudflared', args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        this.proc = currentProc
      } catch (err) {
        clearTimeout(timeout)
        this._startTimeout = null
        this.status = 'error'
        this.lastError = 'Failed to launch cloudflared: ' + (err.message || err)
        return reject(new Error(this.lastError))
      }

      const onOutput = (chunk) => {
        // #343 Stale process output must not overwrite new tunnel state
        if (this.proc !== currentProc) return
        const text = chunk.toString('utf8')
        // #47 Parse published public URL or detect named tunnel connection readiness
        if (this.mode === 'named') {
          if (NAMED_READY_REGEX.test(text) && !this.publicUrl) {
            const rawHost = this.hostname || ''
            this.publicUrl = rawHost
              ? (rawHost.startsWith('http://') || rawHost.startsWith('https://') ? rawHost : `https://${rawHost}`)
              : 'named-tunnel'
            this.status = 'active'
            this.log(`Cloudflare named tunnel active: ${this.publicUrl}`)
            this.emit('active', this.publicUrl)
            if (!resolved) {
              resolved = true
              if (this._startTimeout && this.proc === currentProc) {
                clearTimeout(this._startTimeout)
                this._startTimeout = null
              }
              resolve(this.publicUrl)
            }
          }
        } else {
          const match = text.match(QUICK_URL_REGEX)
          if (match && !this.publicUrl) {
            this.publicUrl = match[0]
            this.status = 'active'
            this.log(`Cloudflare WAN tunnel active: ${this.publicUrl}`)
            this.emit('active', this.publicUrl)
            if (!resolved) {
              resolved = true
              if (this._startTimeout && this.proc === currentProc) {
                clearTimeout(this._startTimeout)
                this._startTimeout = null
              }
              resolve(this.publicUrl)
            }
          }
        }
      }

      currentProc.stdout?.on('data', onOutput)
      currentProc.stderr?.on('data', onOutput)

      // #372 Handle child spawn error safely
      currentProc.on('error', (err) => {
        if (this.proc === currentProc) {
          if (this._startTimeout) {
            clearTimeout(this._startTimeout)
            this._startTimeout = null
          }
          this.status = 'error'
          this.lastError = err.message || String(err)
        }
        this.emit('error', err)
        if (!resolved) {
          resolved = true
          reject(err)
        }
      })

      // #343 Isolate exit handler to current process instance
      currentProc.on('exit', (code) => {
        const isCurrent = (this.proc === currentProc)
        if (isCurrent) {
          if (this._startTimeout) {
            clearTimeout(this._startTimeout)
            this._startTimeout = null
          }
          this.status = 'stopped'
          this.publicUrl = null
          this.proc = null
        }
        this.emit('stopped', code)
        if (!resolved) {
          resolved = true
          const msg = this._stopping ? 'Tunnel stopped' : `cloudflared exited with code ${code}`
          reject(new Error(msg))
        }
      })
    })
  }

  /**
   * Stop Cloudflare tunnel.
   */
  stop() {
    this._stopping = true
    if (this._startTimeout) {
      clearTimeout(this._startTimeout)
      this._startTimeout = null
    }
    if (this.proc) {
      const procToKill = this.proc
      this.proc = null
      const canKill = procToKill._handle ? (typeof procToKill.pid === 'number' && procToKill.pid > 0) : true
      if (canKill) {
        try {
          procToKill.kill('SIGTERM')
        } catch (err) {
          if (err && err.code !== 'ESRCH' && typeof this.log === 'function') {
            this.log('[tunnel] process kill error: ' + (err.message || err))
          }
        }
        const escalateTimer = setTimeout(() => {
          try {
            if (!procToKill.killed && (procToKill._handle ? procToKill.pid > 0 : true)) procToKill.kill('SIGKILL')
          } catch (_) { /* bestEffort */ }
        }, 3000)
        if (escalateTimer.unref) escalateTimer.unref()
      }
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
      hostname: this.hostname,
      scheme: this.scheme,
      originServerName: this.originServerName,
      caPool: this.caPool,
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
export function isCloudflareRequest(headers, remoteAddress, trustedProxyCidrs = DEFAULT_TRUSTED_PROXY_CIDRS) {
  if (!headers) return false
  const hasHeaders = Boolean(headers['cf-ray'] || headers['cf-connecting-ip'] || headers['cf-visitor'])
  if (!hasHeaders) return false
  if (remoteAddress === undefined || remoteAddress === null || remoteAddress === '') return true
  return isTrustedProxy(remoteAddress, trustedProxyCidrs)
}