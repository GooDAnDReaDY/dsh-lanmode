// Agent tool /mobileqr for instant smartphone or tablet login on local network.
// Zero hardcoded Cyrillic characters.

import { tokenFrom } from './handoff.js'
import { generateQRSvg } from './qr.js'

export function registerMobileQrTool(ctx, state) {
  ctx.inject(['tools'], (tctx) => {
    try {
      tctx.tools.register({
        name: 'mobileqr',
        description: 'Generate QR code and link for instant smartphone or tablet login on local network.',
        parameters: { type: 'object', properties: {} },
        execute: async () => {
          const scheme = state.listener ? state.listener.scheme : 'http'
          const port = state.listener ? state.listener.port : (ctx.webServer?.port || 3088)
          let token = ''
          try {
            const conn = ctx.get?.('connection') || ctx.connection
            if (conn) token = tokenFrom(conn.authenticatedUrl('http://127.0.0.1:' + port))
          } catch (err) {
            if (ctx?.logger && typeof ctx.logger.debug === 'function') {
              ctx.logger.debug(`[dsh-lanmode] tool token extraction deferred: ${err?.message || err}`)
            }
          }

          const mdnsHost = state.mdnsName || 'dsh.local'
          const primaryUrl = `${scheme}://${mdnsHost}:${port}/${token ? '?token=' + token : ''}`

          let svg = ''
          try {
            svg = generateQRSvg(primaryUrl, { size: 260 })
          } catch (_) {
            svg = `<p><a href="${primaryUrl}">${primaryUrl}</a></p>`
          }

          return {
            content: [
              {
                type: 'text',
                text: `📱 **Mobile LAN Connection**\n\n`
                  + `* **Address (mDNS):** [${primaryUrl}](${primaryUrl})\n`
                  + `* **Port:** \`${port}\`\n\n`
                  + `Scan this QR code with your mobile camera to connect:`,
              },
              {
                type: 'text',
                text: svg,
              },
            ],
          }
        },
      })
    } catch (err) {
      if (ctx?.logger && typeof ctx.logger.debug === 'function') {
        ctx.logger.debug(`[dsh-lanmode] tool registration deferred: ${err?.message || err}`)
      }
    }
  })
}
