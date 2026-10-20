import { Transform } from "node:stream"
import zlib from "node:zlib"

// Check if Data-Saver mode is requested by client or configured globally.
export function isDataSaverActive(req, options = {}) {
  if (options.dataSaver === true) return true
  if (!req) return false
  const headers = req.headers || {}
  if (headers["save-data"] === "on") return true
  const cookie = headers.cookie || ""
  if (cookie.includes("dsh_datasaver=1") || cookie.includes("dsh_data_saver=1")) return true
  const url = req.url || ""
  if (/\b(datasaver|data_saver|data-saver)=1\b/i.test(url)) return true
  return false
}

// Adaptive SSE Debounce Transform (batches high-frequency deltas into 50-80ms window)
export class SseDebounceTransform extends Transform {
  constructor(options = {}) {
    super(options)
    this.debounceMs = Number(options.debounceMs) || 60
    this.buffer = []
    this.timer = null
    this.destroyed = false
  }

  _flushBuffer() {
    if (this.destroyed) return
    this.timer = null
    if (this.buffer.length === 0) return
    const chunk = Buffer.concat(this.buffer)
    this.buffer = []
    this.push(chunk)
  }

  _transform(chunk, encoding, callback) {
    if (this.destroyed) return callback()
    this.buffer.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding))
    if (!this.timer) {
      this.timer = setTimeout(() => this._flushBuffer(), this.debounceMs)
      if (typeof this.timer.unref === "function") this.timer.unref()
    }
    callback()
  }

  _flush(callback) {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this._flushBuffer()
    callback()
  }

  _destroy(err, callback) {
    this.destroyed = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.buffer = []
    callback(err)
  }
}

export function createSseDebounceTransform(debounceMs = 60) {
  return new SseDebounceTransform({ debounceMs })
}

// Apply Data-Saver pipeline to SSE streaming response.
export function applyDataSaverSse(req, res, answer, options = {}, isH2 = false) {
  const active = isDataSaverActive(req, options)
  if (!active) return false

  const contentType = String(answer.headers["content-type"] || "")
  const acceptHeader = String(req.headers["accept"] || "")
  const isSse = contentType.includes("text/event-stream")
    || acceptHeader.includes("text/event-stream")
    || answer.headers["x-accel-buffering"] === "no"

  if (!isSse) return false

  const outHeaders = { ...answer.headers }
  outHeaders["x-dsh-datasaver"] = "active"
  delete outHeaders["content-length"]

  const debounceMs = Number(options.dataSaverDebounceMs) || 60
  const debouncer = createSseDebounceTransform(debounceMs)
  const acceptEncoding = req.headers["accept-encoding"] || ""

  let compressor = null
  if (options.dataSaverCompress !== false) {
    if (acceptEncoding.includes("gzip")) {
      outHeaders["content-encoding"] = "gzip"
      compressor = zlib.createGzip({ level: 1 })
    } else if (acceptEncoding.includes("br") && zlib.createBrotliCompress) {
      outHeaders["content-encoding"] = "br"
      compressor = zlib.createBrotliCompress({
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 2 },
      })
    }
  }

  const prepareHeaders = options.prepareHeaders || ((h) => h)
  const finalHeaders = prepareHeaders(outHeaders, req)
  res.writeHead(answer.statusCode || 200, finalHeaders)

  if (compressor) {
    compressor.on("error", () => { if (!res.writableEnded) res.end() })
    debouncer.on("error", () => { if (!res.writableEnded) res.end() })
    answer.pipe(debouncer).pipe(compressor).pipe(res)
  } else {
    debouncer.on("error", () => { if (!res.writableEnded) res.end() })
    answer.pipe(debouncer).pipe(res)
  }

  return true
}
