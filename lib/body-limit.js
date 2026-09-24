// Shared cap for small control-plane request bodies.
// Chat and file proxy streams are not read here.

export const MAX_BODY_BYTES = 64 * 1024

export function readLimitedBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > maxBytes) {
        if (typeof req.pause === 'function') req.pause()
        finish({ ok: false })
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks.map((chunk) => (
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      ))).toString('utf8')
      finish({ ok: true, text })
    })
    req.on('error', () => finish({ ok: false }))
  })
}

export function rejectTooLarge(res, req) {
  res.writeHead(413, {
    'content-type': 'application/json; charset=utf-8',
    connection: 'close',
  })
  res.end(JSON.stringify({ error: 'Request body is too large' }))
  if (typeof res.on === 'function') {
    res.on('finish', () => {
      if (req && typeof req.destroy === 'function') req.destroy()
    })
  }
}
