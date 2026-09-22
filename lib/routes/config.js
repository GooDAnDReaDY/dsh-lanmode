// Config read/write HTTP API for dsh-lanmode.
// Replaces the removed settingsScope (DSH 0.1.7+).
// Zero hardcoded Cyrillic characters.

import { Config } from '../config-schema.js'

const CONFIG_PATH = '/dsh-lanmode/api/config'

/**
 * Register GET and PATCH endpoints for reading and updating plugin config.
 * The client-side settings card uses these instead of settingsScope.
 *
 * @param {object} ctx       - Cordis context with webServer.
 * @param {object} effective - Current effective config (mutated in place).
 * @param {function|null} onConfigUpdated - Callback to trigger live config reload.
 */
export function registerConfigApi(ctx, effective, onConfigUpdated) {
  if (!ctx.webServer || typeof ctx.webServer.register !== 'function') return

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: CONFIG_PATH,
    handler: (req, res) => {
      if (req.method === 'GET') {
        return handleGet(req, res, effective)
      }
      if (req.method === 'PATCH') {
        return handlePatch(req, res, effective, onConfigUpdated)
      }
      res.writeHead(405, { 'content-type': 'text/plain' })
      res.end('Method Not Allowed')
    },
  }), 'dsh-lanmode: config HTTP API')
}

function handleGet(req, res, effective) {
  const safe = sanitize(effective)
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify({ status: 'ready', value: safe }))
}

function handlePatch(req, res, effective, onConfigUpdated) {
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    try {
      const patch = JSON.parse(body || '{}')
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Body must be a JSON object' }))
        return
      }

      // Validate keys against schema.
      const schemaKeys = Object.keys(Config.dict || {})
      const errors = []
      for (const key of Object.keys(patch)) {
        if (schemaKeys.length > 0 && !schemaKeys.includes(key)) {
          errors.push({ key, error: 'Unknown config key' })
          continue
        }
        effective[key] = patch[key]
      }

      if (typeof onConfigUpdated === 'function') {
        onConfigUpdated(effective)
      }

      const safe = sanitize(effective)
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        status: 'ready',
        value: safe,
        applied: Object.keys(patch).length - errors.length,
        errors: errors.length > 0 ? errors : undefined,
        restart: true,
      }))
    } catch (err) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON: ' + String(err.message || err) }))
    }
  })
}

/** Strip secret values from config before sending to client. */
function sanitize(config) {
  const result = Object.assign({}, config)
  // Mask actual password and PIN values, keep refs.
  if (result.lanPin) result.lanPin = '***'
  if (result.tunnelToken) result.tunnelToken = '***'
  if (result.authPassword) result.authPassword = '***'
  return result
}
