import test from 'node:test'
import assert from 'node:assert/strict'
import { startDirectBridge } from '../lib/bridge.js'
import { discoverLoopbackPort, explicitUpstreamPort, resolveUpstreamPort } from '../lib/upstream-port.js'

test('Issue #215: an explicit harness port skips the probe', async () => {
  let called = false
  const port = await resolveUpstreamPort({ port: 3099 }, async () => {
    called = true
    return 3080
  })
  assert.equal(port, 3099)
  assert.equal(called, false)
  assert.equal(explicitUpstreamPort({ address: () => ({ port: 3082 }) }), 3082)
})

test('Issue #215: discovery walks 3080 then 3081 then 3082', async () => {
  const seen = []
  const port = await discoverLoopbackPort(async (candidate) => {
    seen.push(candidate)
    return candidate === 3082
  })
  assert.deepEqual(seen, [3080, 3081, 3082])
  assert.equal(port, 3082)
})

test('Issue #215: a missing port asks the probe before giving up', async () => {
  let seen = 0
  const stop = startDirectBridge({}, {
    probeUpstreamPort: async () => {
      seen += 1
      return 0
    },
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  stop()
  assert.equal(seen, 1)
})
