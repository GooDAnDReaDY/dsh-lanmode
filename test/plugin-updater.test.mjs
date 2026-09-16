import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isTrustedUpdateRequest,
  parseSemver,
  isNewerVersion,
  status,
} from '../lib/plugin-updater.js'

function makeReq({ remote = '127.0.0.1', headers = {} } = {}) {
  return {
    socket: { remoteAddress: remote },
    headers: {
      ...headers,
    },
  }
}

test('Issue #134: isTrustedUpdateRequest security verification', () => {
  // 1. Rejects without x-dsh-plugin-update: 1 header
  assert.equal(
    isTrustedUpdateRequest(makeReq({
      headers: { origin: 'http://127.0.0.1:3080', host: '127.0.0.1:3080' },
    })),
    false,
  )

  // 2. Rejects cross-site fetch
  assert.equal(
    isTrustedUpdateRequest(makeReq({
      headers: {
        'x-dsh-plugin-update': '1',
        'sec-fetch-site': 'cross-site',
        origin: 'http://127.0.0.1:3080',
        host: '127.0.0.1:3080',
      },
    })),
    false,
  )

  // 3. Rejects origin/host mismatch
  assert.equal(
    isTrustedUpdateRequest(makeReq({
      headers: {
        'x-dsh-plugin-update': '1',
        origin: 'http://evil.com',
        host: '127.0.0.1:3080',
      },
    })),
    false,
  )

  // 4. Accepts valid loopback same-origin request
  assert.equal(
    isTrustedUpdateRequest(makeReq({
      remote: '127.0.0.1',
      headers: {
        'x-dsh-plugin-update': '1',
        'sec-fetch-site': 'same-origin',
        origin: 'http://127.0.0.1:3080',
        host: '127.0.0.1:3080',
      },
    })),
    true,
  )

  // 5. Accepts IPv6 loopback
  assert.equal(
    isTrustedUpdateRequest(makeReq({
      remote: '::1',
      headers: {
        'x-dsh-plugin-update': '1',
        origin: 'http://[::1]:3080',
        host: '[::1]:3080',
      },
    })),
    true,
  )

  // 6. Non-loopback rejected when no admin credentials
  assert.equal(
    isTrustedUpdateRequest(makeReq({
      remote: '192.168.1.50',
      headers: {
        'x-dsh-plugin-update': '1',
        origin: 'http://192.168.1.111:3080',
        host: '192.168.1.111:3080',
      },
    })),
    false,
  )
})

test('Issue #134: semantic version parsing and comparison', () => {
  assert.deepEqual(parseSemver('0.7.18'), { core: [0, 7, 18], prerelease: [] })
  assert.deepEqual(parseSemver('1.2.3-beta.1'), { core: [1, 2, 3], prerelease: ['beta', '1'] })
  assert.equal(parseSemver('invalid'), undefined)

  // Newer versions
  assert.equal(isNewerVersion('0.7.18', '0.7.19'), true)
  assert.equal(isNewerVersion('0.7.18', '0.8.0'), true)
  assert.equal(isNewerVersion('0.7.18', '1.0.0'), true)
  assert.equal(isNewerVersion('0.7.18-rc.1', '0.7.18'), true)

  // Not newer versions
  assert.equal(isNewerVersion('0.7.19', '0.7.19'), false)
  assert.equal(isNewerVersion('0.7.19', '0.7.18'), false)
  assert.equal(isNewerVersion('1.0.0', '0.7.19'), false)
  assert.equal(isNewerVersion('invalid', '0.7.19'), false)
  assert.equal(isNewerVersion('0.7.19', 'invalid'), false)
})

test('Issue #134: status() reports plugin identity and version state', async () => {
  const result = await status({
    packageName: '@goodandready/dsh-lanmode',
    manifestUrl: new URL('../package.json', import.meta.url),
    registry: 'https://registry.npmjs.org',
  }, {
    profileName: 'web',
    cliEntry: '/fake/entry',
  })

  assert.equal(result.packageName, '@goodandready/dsh-lanmode')
  assert.equal(typeof result.currentVersion, 'string')
  assert.equal(result.canAutoUpdate, true)
  assert.equal(typeof result.updateAvailable, 'boolean')
})
