// PWA Web App Manifest generator and route handler for dsh-lanmode.
// Provides standalone mobile app installation, shortcuts, and splash configuration.
// Zero hardcoded Cyrillic characters.

export const defaultManifest = {
  name: 'DeepSeek Harness',
  short_name: 'DSH',
  id: 'dsh-lanmode-pwa',
  description: 'DeepSeek Harness Web UI Mobile & LAN Gateway',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  background_color: '#11111b',
  theme_color: '#1e1e2e',
  categories: ['utilities', 'productivity', 'developer'],
  icons: [
    { src: '/favicon.ico', sizes: '64x64 32x32 24x24 16x16', type: 'image/x-icon' },
    { src: '/favicon.ico', sizes: '192x192 512x512', type: 'image/x-icon', purpose: 'any maskable' },
  ],
  shortcuts: [
    { name: 'New Chat', url: '/?new=1', description: 'Start a new conversation with agent' },
  ],
}

export function registerPwaManifestRoute(ctx, path = '/dsh-lanmode/manifest.json') {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path,
    handler: (req, res) => {
      res.writeHead(200, { 'content-type': 'application/manifest+json; charset=utf-8' })
      res.end(JSON.stringify(defaultManifest, null, 2))
    },
  }), 'dsh-lanmode: PWA manifest')
}
