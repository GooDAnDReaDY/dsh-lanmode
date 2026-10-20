// Tailscale MagicDNS, Headscale and Tailscale Funnel helper (Issues #457, #467)
// Zero hardcoded Cyrillic characters.

import { execSync } from 'node:child_process'

let cachedMagicDns = null
let lastProbeTime = 0
const CACHE_TTL_MS = 60000

let cachedFunnelStatus = null
let lastFunnelProbeTime = 0
const FUNNEL_CACHE_TTL_MS = 5000

export function getTailscaleMagicDns(options = {}) {
  const now = Date.now()
  if (cachedMagicDns && (now - lastProbeTime < CACHE_TTL_MS) && !options.force) {
    return cachedMagicDns
  }

  const exec = options.execFn || execSync
  try {
    const raw = exec('tailscale status --json', {
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

export function getTailscaleFunnelStatus(options = {}) {
  const now = Date.now()
  if (cachedFunnelStatus && (now - lastFunnelProbeTime < FUNNEL_CACHE_TTL_MS) && !options.force) {
    return cachedFunnelStatus
  }

  const exec = options.execFn || execSync
  try {
    const raw = exec('tailscale funnel status --json', {
      timeout: 2500,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const data = JSON.parse(raw)
    const allowFunnel = data?.AllowFunnel || {}
    let activeHost = null
    for (const [target, enabled] of Object.entries(allowFunnel)) {
      if (enabled) {
        activeHost = target
        break
      }
    }

    let url = null
    if (activeHost) {
      const cleanHost = activeHost.replace(/:443$/, '')
      url = 'https://' + cleanHost
    }

    let magicHost = null
    if (data?.Web) {
      const firstWeb = Object.keys(data.Web)[0]
      if (firstWeb) magicHost = firstWeb.replace(/:443$/, '')
    }
    if (!magicHost) {
      const mdns = getTailscaleMagicDns(options)
      if (mdns?.fqdn) magicHost = mdns.fqdn
    }

    cachedFunnelStatus = {
      available: true,
      enabled: Boolean(activeHost),
      url,
      host: activeHost ? activeHost.replace(/:443$/, '') : magicHost,
      ports: data?.TCP ? Object.keys(data.TCP) : [],
    }
    lastFunnelProbeTime = now
    return cachedFunnelStatus
  } catch (err) {
    const mdns = getTailscaleMagicDns(options)
    cachedFunnelStatus = {
      available: Boolean(mdns?.enabled),
      enabled: false,
      url: null,
      host: mdns?.fqdn || null,
      ports: [],
      error: mdns?.enabled ? 'Funnel inactive or not configured' : 'Tailscale daemon unavailable or not installed',
    }
    lastFunnelProbeTime = now
    return cachedFunnelStatus
  }
}

export function setTailscaleFunnel(enable, { port = 8443, execFn = execSync } = {}) {
  const exec = execFn || execSync
  if (enable) {
    exec(`tailscale funnel --bg --yes ${Number(port) || 8443}`, {
      timeout: 8000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } else {
    exec('tailscale funnel reset', {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  }
  return getTailscaleFunnelStatus({ force: true, execFn: exec })
}
