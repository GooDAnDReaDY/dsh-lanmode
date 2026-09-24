// Classify plugin HTTP paths so a new route cannot skip the password gate.

export const PUBLIC_PATH_PREFIXES = [
  '/dsh-lanmode/auth/',
  '/dsh-lanmode/ca.crt',
  '/dsh-lanmode/ca.der',
  '/dsh-lanmode/ca.mobileconfig',
  '/dsh-lanmode/manifest.json',
  '/dsh-lanmode/manifest.webmanifest',
  '/dsh-lanmode/sw.js',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/dsh-lanmode/qr',
  '/dsh-lanmode/pair-accept',
  '/dsh-lanmode/pair-app',
]

export const GATED_PLUGIN_ROUTES = [
  '/dsh-lanmode/health',
  '/dsh-lanmode/probe',
  '/dsh-lanmode/devices',
  '/dsh-lanmode/devices/revoke',
  '/dsh-lanmode/devices/kill-all',
  '/dsh-lanmode/devices/nickname',
  '/dsh-lanmode/tunnel',
  '/dsh-lanmode/tunnel/toggle',
  '/dsh-lanmode/loopback-token',
  '/dsh-lanmode/api/interfaces',
  '/dsh-lanmode/api/telemetry',
  '/dsh-lanmode/api/config',
  '/dsh-lanmode/api/devices',
  '/dsh-lanmode/api/devices/revoke',
  '/dsh-lanmode/api/devices/revoke-others',
  '/dsh-lanmode/bans',
]

export const IGNORED_PLUGIN_PATHS = [
  '/dsh-lanmode/reopen-token',
]

export function isPublicPluginPath(url, prefixes = PUBLIC_PATH_PREFIXES) {
  const path = String(url || '').split('?')[0]
  return prefixes.some((prefix) => path === prefix || path.startsWith(prefix))
}

export function pluginPathsInSource(source) {
  const found = new Set()
  const re = /['"`](\/dsh-lanmode\/[A-Za-z0-9._~/-]+)['"`]/g
  for (const match of String(source || '').matchAll(re)) found.add(match[1])
  return [...found]
}

export function unknownPluginPaths(paths, options = {}) {
  const gated = new Set(options.gated || GATED_PLUGIN_ROUTES)
  const ignored = new Set(options.ignored || IGNORED_PLUGIN_PATHS)
  const prefixes = options.prefixes || PUBLIC_PATH_PREFIXES
  return paths.filter((path) => {
    if (ignored.has(path) || gated.has(path)) return false
    return !isPublicPluginPath(path, prefixes)
  })
}

export function assertGuarded(routes = GATED_PLUGIN_ROUTES, prefixes = PUBLIC_PATH_PREFIXES) {
  const open = routes.filter((route) => isPublicPluginPath(route, prefixes))
  if (open.length) {
    throw new Error('dsh-lanmode: unguarded routes: ' + open.join(', '))
  }
  return true
}
