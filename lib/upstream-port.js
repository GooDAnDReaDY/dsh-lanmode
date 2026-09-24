// Find the harness loopback port when the context does not name one.

import net from 'node:net'

export const LOOPBACK_PROBE_PORTS = [3080, 3081, 3082]

export function explicitUpstreamPort(webServer) {
  const raw = webServer?.port ?? (typeof webServer?.address === 'function' ? webServer.address()?.port : null)
  const port = Number(raw)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return 0
  return port
}

export function probeLoopbackPort(port, timeoutMs = 250) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, timeout: timeoutMs })
    const done = (open) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(open)
    }
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

export async function discoverLoopbackPort(probe = probeLoopbackPort) {
  for (const port of LOOPBACK_PROBE_PORTS) {
    if (await probe(port)) return port
  }
  return 0
}

export async function resolveUpstreamPort(webServer, probe) {
  const known = explicitUpstreamPort(webServer)
  if (known) return known
  const found = Number(await (probe || discoverLoopbackPort)())
  return Number.isInteger(found) && found > 0 ? found : 0
}
