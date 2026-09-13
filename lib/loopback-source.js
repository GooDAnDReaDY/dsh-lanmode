// Loopback origin rewriting in the client connection bundle.
//
// Harness core evaluates isLoopback once on the browser side:
//     isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname),
//
// In remote/LAN access, settings plugins would fall back to in-memory store
// if this flag is false before client shims initialize.
// Rewriting this single computed property on the fly ensures providers and settings
// initialize with proper local storage behavior across the network.

export const CONNECTION_BUNDLE = '/plugins/@deepseek-ai/dsh-client-connection/client.js'

const COMPUTED = 'isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname),'

const ALWAYS = 'isLoopback: true,'

/** Check if request targets the connection client bundle. */
export function isConnectionBundle(url) {
  const path = String(url ?? '').split('?')[0]
  return path === CONNECTION_BUNDLE
}

/**
 * Replace computed loopback condition with constant true.
 *
 * @param {string} source Bundle source code
 * @returns {{ source: string, changed: boolean }}
 */
export function forceLoopback(source) {
  const text = String(source)
  if (!text.includes(COMPUTED)) return { source: text, changed: false }
  return { source: text.replace(COMPUTED, ALWAYS), changed: true }
}
