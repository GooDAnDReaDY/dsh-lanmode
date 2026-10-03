// Network interface categorization and LAN client detection for dsh-lanmode bridge.
// Zero hardcoded Cyrillic characters.

import os from 'node:os'
import { isTailscaleAddress } from './tls.js'

function isLoopbackIp(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

/**
 * Identify whether a client connects via a standard high-speed local LAN / Wi-Fi subnet.
 * In local gigabit network, dynamic Brotli/Gzip recompression causes CPU overhead
 * without meaningful latency gain.
 * For WAN, Tailscale (100.64.0.0/10), WireGuard or Cloudflare tunnels, compression remains active.
 */
export function isLocalLanClient(ip = '') {
  const clean = String(ip || '').replace(/^::ffff:/, '')
  if (isLoopbackIp(clean)) return true
  // Private IPv4 LAN ranges
  if (/^192\.168\./.test(clean)) return true
  if (/^10\./.test(clean)) return true
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true
  // IPv6 Unique Local Address (fc00::/7) or Link-Local (fe80::/10)
  if (/^(fc|fd|fe80)/i.test(clean)) return true
  return false
}

export function categorizeInterface(ifaceName, addr) {
  if (addr === '127.0.0.1' || addr === '::1' || ifaceName === 'lo') return 'loopback'
  if (isTailscaleAddress(addr) || ifaceName.includes('tailscale') || ifaceName.includes('ts')) return 'tailscale'
  if (ifaceName.includes('wg')) return 'wireguard'
  if (ifaceName.includes('tun')) return 'vpn'
  return 'lan'
}

/** Collect and categorize network interfaces (#375). */
export function getCategorizedInterfaces(hosts = [], options = {}) {
  const result = []
  const seen = new Set()

  const mdnsName = (options && options.mdnsName) || 'dsh.local'

  const addIfNew = (addr, type, label) => {
    if (!addr || seen.has(addr)) return
    seen.add(addr)
    result.push({
      address: addr,
      category: type,
      type: type,
      name: label,
      label: label,
    })
  }

  // Check mDNS
  if (!options || options.mdns !== false) {
    addIfNew(mdnsName, 'mdns', `mDNS (${mdnsName})`)
  }

  const ifaces = os.networkInterfaces()
  for (const [ifaceName, list] of Object.entries(ifaces)) {
    for (const item of list || []) {
      if (!item || item.internal) continue
      const addr = item.address
      if (item.family === 'IPv4' || item.family === 4) {
        if (isTailscaleAddress(addr) || ifaceName.includes('tailscale') || ifaceName.includes('ts')) {
          addIfNew(addr, 'tailscale', `Tailscale (${addr})`)
        } else if (ifaceName.includes('wg') || ifaceName.includes('tun')) {
          addIfNew(addr, 'vpn', `WireGuard/VPN (${addr})`)
        } else {
          addIfNew(addr, 'lan', `Local LAN (${addr})`)
        }
      } else if (item.family === 'IPv6' || item.family === 6) {
        if (!addr.startsWith('fe80:') && !addr.startsWith('::1')) {
          addIfNew(addr, 'lan', `Local LAN IPv6 (${addr})`)
        }
      }
    }
  }

  for (const host of hosts) {
    if (!seen.has(host) && !host.startsWith('127.') && host !== '::1') {
      addIfNew(host, 'other', host)
    }
  }

  return result
}
