// Tailscale MagicDNS and Headscale auto-detection helper (Issue #457)
// Zero hardcoded Cyrillic characters.

import { execSync } from 'node:child_process'

let cachedMagicDns = null
let lastProbeTime = 0
const CACHE_TTL_MS = 60000

export function getTailscaleMagicDns(options = {}) {
  const now = Date.now()
  if (cachedMagicDns && (now - lastProbeTime < CACHE_TTL_MS) && !options.force) {
    return cachedMagicDns
  }

  try {
    const raw = execSync('tailscale status --json', {
      timeout: 1500,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const data = JSON.parse(raw)
    const selfNode = data?.Self
    const dnsName = (selfNode?.DNSName || '').replace(/\.+$/, '')
    const suffix = data?.MagicDNSSuffix || ''
    const hostName = selfNode?.HostName || ''

    if (dnsName) {
      cachedMagicDns = {
        enabled: true,
        fqdn: dnsName,
        hostName,
        suffix,
        ips: selfNode?.TailscaleIPs || [],
      }
      lastProbeTime = now
      return cachedMagicDns
    }
  } catch (_) {
    // Tailscale CLI not installed, socket unavailable, or non-Tailscale machine
  }

  cachedMagicDns = {
    enabled: false,
    fqdn: null,
    hostName: null,
    suffix: null,
    ips: [],
  }
  lastProbeTime = now
  return cachedMagicDns
}
