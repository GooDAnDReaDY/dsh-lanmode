import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveSecret,
  clearSecretCache,
  SECRET_POSITIVE_TTL_MS,
  SECRET_NEGATIVE_TTL_MS,
} from '../lib/secret.js'

test('Issue #282: resolved secrets are reused until the TTL ends', async () => {
  clearSecretCache()
  let calls = 0
  const ctx = {
    credentials: {
      resolve: async () => {
        calls += 1
        return { value: 'cached-secret' }
      },
    },
  }
  const first = await resolveSecret(ctx, 'CACHE_PROBE_OK', '', 1_000)
  const second = await resolveSecret(ctx, 'CACHE_PROBE_OK', '', 2_000)
  assert.equal(first, 'cached-secret')
  assert.equal(second, 'cached-secret')
  assert.equal(calls, 1)
  await resolveSecret(ctx, 'CACHE_PROBE_OK', '', 1_000 + SECRET_POSITIVE_TTL_MS)
  assert.equal(calls, 2)
  clearSecretCache()
})

test('Issue #282: a missing ref is cached briefly and an empty ref is not', async () => {
  clearSecretCache()
  let calls = 0
  const ctx = {
    credentials: {
      resolve: async () => {
        calls += 1
        return null
      },
    },
  }
  assert.equal(await resolveSecret(ctx, 'CACHE_PROBE_MISS', '', 0), 'CACHE_PROBE_MISS')
  assert.equal(await resolveSecret(ctx, 'CACHE_PROBE_MISS', '', 1_000), 'CACHE_PROBE_MISS')
  assert.equal(calls, 1)
  await resolveSecret(ctx, 'CACHE_PROBE_MISS', '', SECRET_NEGATIVE_TTL_MS)
  assert.equal(calls, 2)
  assert.equal(await resolveSecret({}, '', 'one', 0), 'one')
  assert.equal(await resolveSecret({}, '', 'two', 0), 'two')
  clearSecretCache()
})
