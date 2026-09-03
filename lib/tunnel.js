// Cloudflare Tunnels драйвер для удаленного WAN-доступа без белого IP (#46, #47, #48, #49, #50).
//
// Возможности:
// - #46: Поддержка Quick Tunnels (trycloudflare.com) и Named Tunnels (токен)
// - #47: Авто-парсинг публичного URL из вывода cloudflared
// - #48: Интеграция с генератором QR для мгновенного входа со смартфона через интернет
// - #49: Динамический запуск/остановка туннеля через API без перезапуска сервера
// - #50: Детекция входящего WAN-трафика Cloudflare (CF-Connecting-IP, CF-Ray)

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
   * Запустить туннель Cloudflare.
   * @param {object} [opts] Опции запуска
   * @returns {Promise<string>} Публичный URL
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
          this.lastError = 'Таймаут получения публичного адреса Cloudflare'
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
        this.lastError = 'Не удалось запустить cloudflared: ' + (err.message || err)
        return reject(new Error(this.lastError))
      }

      const onOutput = (chunk) => {
        const text = chunk.toString('utf8')
        // #47 Парсинг выданного публичного URL
        const match = text.match(QUICK_URL_REGEX)
        if (match && !this.publicUrl) {
          this.publicUrl = match[0]
          this.status = 'active'
          this.log(`Cloudflare WAN туннель открыт: ${this.publicUrl}`)
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
          reject(new Error(`cloudflared завершился с кодом ${code}`))
        }
      })
    })
  }

  /**
   * Остановить туннель.
   */
  stop() {
    if (this.proc) {
      try {
        this.proc.kill('SIGTERM')
      } catch (_) {}
      this.proc = null
    }
    this.status = 'stopped'
    this.publicUrl = null
  }

  /**
   * Получить текущее состояние туннеля.
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
 * Проверить, пришел ли запрос через Cloudflare туннель (#50).
 * @param {object} headers HTTP заголовки запроса
 * @returns {boolean}
 */
export function isCloudflareRequest(headers) {
  if (!headers) return false
  return Boolean(headers['cf-ray'] || headers['cf-connecting-ip'] || headers['cf-visitor'])
}
