// Automatic network mode detection (direct vs proxy).
//
// Detects whether an existing reverse proxy (Nginx, Traefik, Caddy, etc.) is already
// listening on the harness port on network interfaces.
// If an existing service answers on LAN IP:port, dsh-lanmode remains in proxy mode.
// If no service answers and the direct port is free, dsh-lanmode starts its own direct TLS bridge.

import net from 'node:net'

/** Probe if a host:port is actively accepting connections. */
function knock(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (answer) => {
      socket.removeAllListeners()
      try { socket.destroy() } catch (_) { /* socket already dead */ }
      resolve(answer)
    }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.on('connect', () => done(true))
    socket.on('error', () => done(false))
  })
}

/** Check if address is a loopback interface. */
export function isLoopback(address) {
  const clean = String(address).trim()
  return clean === 'localhost' || clean === '::1' || clean === '[::1]' || /^127\./.test(clean)
}

/** Check if address is worth probing (excluding loopback and link-local). */
export function worthAsking(address) {
  const clean = String(address ?? '').trim()
  if (!clean || isLoopback(clean)) return false
  if (/^fe80:/i.test(clean)) return false
  if (/^169\.254\./.test(clean)) return false
  return /^[0-9.]+$/.test(clean) || clean.includes(':')
}

/**
 * Automatically determine network mode (direct vs proxy).
 *
 * @param options {{addresses: string[], port: number, directPort?: number,
 *                  timeoutMs?: number, probe?: Function}}
 * @returns `{ mode: 'proxy'|'direct', reason: string }`
 */
export async function detectMode(options) {
  const probe = options.probe ?? knock
  const timeoutMs = options.timeoutMs ?? 1000
  const addresses = (options.addresses ?? []).filter(worthAsking)

  if (!options.port) {
    return { mode: 'proxy', reason: 'Harness port is unknown — staying in proxy mode' }
  }
  if (addresses.length === 0) {
    return { mode: 'proxy', reason: 'No network addresses found — staying in proxy mode' }
  }

  let answers
  try {
    answers = await Promise.all(addresses.map((address) => probe(address, options.port, timeoutMs)))
  } catch (failed) {
    return {
      mode: 'proxy',
      reason: 'Probing failed (' + String(failed.message || failed) + ') — staying in proxy mode',
    }
  }

  const busy = addresses.filter((address, index) => answers[index])
  if (busy.length) {
    return {
      mode: 'proxy',
      reason: 'Address ' + busy[0] + ':' + options.port + ' is already responding — network is served by existing proxy',
    }
  }

  if (options.directPort) {
    let taken = false
    try {
      taken = await probe('127.0.0.1', options.directPort, timeoutMs)
    } catch (_) {
      taken = false
    }
    if (taken) {
      return {
        mode: 'proxy',
        reason: 'Port ' + options.directPort + ' is already in use — listener not started',
      }
    }
  }

  return {
    mode: 'direct',
    reason: 'No listener on ' + addresses.length + ' network addresses on port ' + options.port
      + ' — starting direct listener',
  }
}
