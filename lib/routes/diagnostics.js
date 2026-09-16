// Diagnostics routes, PWA manifest, CA certificate, probe, and QR generation.
// Zero hardcoded Cyrillic characters.

import crypto from 'node:crypto'

export function registerDiagnosticsRoutes(ctx, options) {
  const {
    state,
    config,
    certificateDir,
    readRootCA,
    hostReport,
    healthPage,
    generateCachedQRSvg,
    routes = {},
  } = options

  const healthPath = routes.health || '/dsh-lanmode/health'
  const caCertPath = routes.caCert || '/dsh-lanmode/ca.crt'
  const manifestPath = routes.manifest || '/dsh-lanmode/manifest.json'
  const qrPath = routes.qr || '/dsh-lanmode/qr'
  const probePath = routes.probe || '/dsh-lanmode/probe'

  // Diagnostic health page
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: healthPath,
    handler: (req, res) => {
      const json = String(req.url ?? '').includes('format=json')
      if (json) {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(hostReport(state), null, 2))
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(healthPage(state))
    },
  }), 'dsh-lanmode: diagnostic health page')

  // Download Root CA certificate
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: caCertPath,
    handler: (req, res) => {
      const dir = certificateDir(config)
      const ca = readRootCA(dir)
      if (!ca) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Root CA certificate not found or TLS disabled')
        return
      }
      res.writeHead(200, {
        'content-type': 'application/x-x509-ca-cert',
        'content-disposition': 'attachment; filename="dsh-lanmode-root-ca.crt"',
      })
      res.end(ca)
    },
  }), 'dsh-lanmode: download Root CA')

  // QR code generation
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: qrPath,
    handler: (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1')
        const mdnsHost = state.mdnsName || 'dsh.local'
        const target = u.searchParams.get('url')
          || (state.listener ? `${state.listener.scheme}://${mdnsHost}:${state.listener.port}/` : `http://${mdnsHost}:3088/`)
        const svg = generateCachedQRSvg(target, { size: 320 })
        const etag = 'W/"' + crypto.createHash('sha1').update(svg).digest('hex').slice(0, 16) + '"'

        if (req.headers['if-none-match'] === etag) {
          res.writeHead(304, {
            'etag': etag,
            'cache-control': 'public, max-age=3600',
          })
          res.end()
          return
        }

        res.writeHead(200, {
          'content-type': 'image/svg+xml; charset=utf-8',
          'etag': etag,
          'cache-control': 'public, max-age=3600',
        })
        res.end(svg)
      } catch (err) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('QR error: ' + (err.message || err))
      }
    },
  }), 'dsh-lanmode: QR code generation')

  // Diagnostic port probe (Self-Test) returns probeResult
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: probePath,
    handler: (req, res) => {
      const probeResult = {
        ok: true,
        scheme: state.listener ? state.listener.scheme : 'http',
        port: state.listener ? state.listener.port : (ctx.webServer?.port || 3088),
        time: new Date().toISOString(),
        uptime: process.uptime(),
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(probeResult, null, 2))
    },
  }), 'dsh-lanmode: diagnostic probe endpoint')
}
