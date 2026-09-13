// Network address selection for direct bridge listener.

import { localAddresses } from './tls.js'

/**
 * Determine which hosts/interfaces to bind the direct listener to.
 * When the configured port matches the harness port, binding to 0.0.0.0 would
 * fail with EADDRINUSE because harness already listens on 127.0.0.1:port.
 * In this case, we bind to each non-loopback network address individually.
 */
export function bindAddresses(config, harnessPort) {
  const wanted = String(config.directHost || '0.0.0.0')
  const port = config.directPort || 3088
  const everywhere = wanted === '0.0.0.0' || wanted === '::' || wanted === ''
  if (!everywhere || port !== harnessPort) return { hosts: [wanted], shared: false }

  const own = localAddresses().filter((address) => {
    if (address === 'localhost' || address === 'dsh.local' || address.endsWith('.local')) return false
    if (/^127\./.test(address) || address === '::1' || address === '[::1]') return false
    return true
  })
  if (own.length === 0) return { hosts: [wanted], shared: false }
  return { hosts: own, shared: true }
}
