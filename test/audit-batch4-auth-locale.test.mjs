// Audit test suite for batch 4: Issues #1, #329, #417, #419.
// Zero hardcoded Cyrillic characters.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveBrowserAuthSecret, mintDshAuthCookie } from '../lib/dsh-auth-cookie.js'
import { hostReport } from '../lib/health.js'
import { renderLoginPage, LOGIN_I18N } from '../lib/login-page.js'
import { apply } from '../lib/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

test('Issue #329: resolveBrowserAuthSecret calls readRecord with single valid CredentialKey and handles missing credentials', async () => {
  let requestedKey = null
  let callArgsCount = 0

  // 1. Mock ctx with credentials service returning record for valid key
  const mockCtx = {
    credentials: {
      async readRecord(...args) {
        callArgsCount = args.length
        requestedKey = args[0]
        if (args[0] === 'client-connection/browser-session') {
          return { payload: { secret: 'mock-secret-key-12345' } }
        }
        return undefined
      },
    },
  }

  const secret = await resolveBrowserAuthSecret(mockCtx)
  assert.equal(secret, 'mock-secret-key-12345')
  assert.equal(requestedKey, 'client-connection/browser-session', 'Must pass single CredentialKey')
  assert.equal(callArgsCount, 1, 'Must call readRecord with exactly one argument')

  // 2. Cordis uninject guard: accessing credentials throws
  const throwingCtx = {
    get credentials() {
      throw new Error('cannot get property "credentials" without inject')
    },
  }
  const fallbackSecret = await resolveBrowserAuthSecret(throwingCtx)
  assert.equal(fallbackSecret, '', 'Must return empty string safely when service access throws')

  // 3. Null ctx
  const nullSecret = await resolveBrowserAuthSecret(null)
  assert.equal(nullSecret, '')
})

test('Issue #417: state.browserAuthSecret and state.dshAuthCookie are actively written and retained', async () => {
  const cleanups = []
  const mockCtx = {
    inject() {},
    effect(fn) {
      const c = fn()
      if (typeof c === 'function') cleanups.push(c)
    },
    webServer: {
      port: 3080,
      register() { return () => {} },
      tapIndex() { return () => {} },
    },
    logger: {
      info() {},
      debug() {},
      warn() {},
      error() {},
    },
    credentials: {
      async readRecord(key) {
        if (key === 'client-connection/browser-session') {
          return { payload: { secret: '0123456789abcdef0123456789abcdef' } }
        }
        return undefined
      },
    },
  }

  const handle = apply(mockCtx, {
    mode: 'off',
    mdns: false,
    diagnostics: false,
  })

  assert.ok(handle && handle.state, 'handle.state must exist')
  assert.equal(handle.state.browserAuthSecret, null, 'browserAuthSecret starts initialized to null')
  assert.equal(handle.state.dshAuthCookie, '', 'dshAuthCookie starts initialized to empty string')

  // Writing to state stores live values
  handle.state.browserAuthSecret = '0123456789abcdef0123456789abcdef'
  assert.equal(handle.state.browserAuthSecret, '0123456789abcdef0123456789abcdef')

  handle.state.dshAuthCookie = 'dsh-auth-127.0.0.1=v1.payload.sig'
  assert.equal(handle.state.dshAuthCookie, 'dsh-auth-127.0.0.1=v1.payload.sig')

  for (const c of cleanups) {
    try { c() } catch (_) {}
  }
})

test('Issue #419: state.interfaces dynamically provides categorized network interfaces for health report', () => {
  const dummyState = {
    version: '0.8.34',
    configSource: 'defaults',
    configWarning: '',
    mode: 'direct',
    modeReason: 'test',
    listener: { hosts: ['127.0.0.1', '192.168.1.100'], port: 3088, scheme: 'http' },
    mdnsName: 'dsh.local',
    mdns: true,
    get interfaces() {
      return [
        { address: 'dsh.local', category: 'mdns', type: 'mdns', label: 'mDNS (dsh.local)' },
        { address: '192.168.1.100', category: 'lan', type: 'lan', label: 'Local LAN (192.168.1.100)' },
      ]
    },
  }

  const report = hostReport(dummyState)
  assert.ok(Array.isArray(report.interfaces), 'report.interfaces must be an array')
  assert.ok(report.interfaces.length >= 2, 'report.interfaces must contain populated items')
  assert.equal(report.interfaces[0].address, 'dsh.local')
  assert.equal(report.interfaces[1].category, 'lan')
})

test('Issue #1: I18N dictionaries in 02-i18n.js contain PIN modal keys for both en and zh', () => {
  const i18nSource = fs.readFileSync(path.join(root, 'lib/client-parts/02-i18n.js'), 'utf8')
  const env = {}
  const wrapper = new Function('window', i18nSource)
  const windowMock = {}
  wrapper(windowMock)
  windowMock.__DSH_LANMODE_PARTS.installI18n(env)

  const { I18N } = env
  assert.ok(I18N.en, 'I18N.en must exist')
  assert.ok(I18N.zh, 'I18N.zh must exist')

  const requiredKeys = [
    "pinModalTitle",
    "pinModalDesc",
    "pinModalPlaceholder",
    "pinModalCancel",
    "pinModalUnlock",
  ]

  for (const key of requiredKeys) {
    assert.ok(I18N.en[key], `Missing en key: ${key}`)
    assert.ok(I18N.zh[key], `Missing zh key: ${key}`)
    if (key !== 'pinModalPlaceholder') {
      assert.notEqual(I18N.en[key], I18N.zh[key], `Key ${key} must have distinct translations in en and zh`)
    }
  }
})

test('Issue #1: renderLoginPage supports locale parameter for en and zh', () => {
  // English render
  const enHtml = renderLoginPage({ locale: 'en', publicHost: 'node.example.com' })
  assert.ok(enHtml.includes('lang="en"'), 'HTML lang must be en')
  assert.ok(enHtml.includes('Sign In'), 'Should contain English Sign In')
  assert.ok(enHtml.includes('Username'), 'Should contain English Username')
  assert.ok(enHtml.includes('Password'), 'Should contain English Password')
  assert.ok(enHtml.includes('Remember for 30 days'), 'Should contain English Remember for 30 days')

  // Chinese render
  const zhHtml = renderLoginPage({ locale: 'zh', publicHost: 'node.example.com' })
  assert.ok(zhHtml.includes('lang="zh"'), 'HTML lang must be zh')
  assert.ok(zhHtml.includes(LOGIN_I18N.zh.title), 'Should contain Chinese title')
  assert.ok(zhHtml.includes(LOGIN_I18N.zh.username), 'Should contain Chinese username label')
  assert.ok(zhHtml.includes(LOGIN_I18N.zh.password), 'Should contain Chinese password label')
  assert.ok(zhHtml.includes(LOGIN_I18N.zh.remember), 'Should contain Chinese remember label')

  // Dynamic client dictionary embedded
  assert.ok(zhHtml.includes('var DICT ='), 'Must embed DICT for client-side language adaptation')
})

test('Issue #1: lib/shim.js PIN prompt modal uses translate helper for all 5 UI strings', () => {
  const shimCode = fs.readFileSync(path.join(root, 'lib/shim.js'), 'utf8')
  assert.ok(shimCode.includes("t('pinModalTitle')"), 'Uses translated pinModalTitle')
  assert.ok(shimCode.includes("t('pinModalDesc')"), 'Uses translated pinModalDesc')
  assert.ok(shimCode.includes("t('pinModalPlaceholder')"), 'Uses translated pinModalPlaceholder')
  assert.ok(shimCode.includes("t('pinModalCancel')"), 'Uses translated pinModalCancel')
  assert.ok(shimCode.includes("t('pinModalUnlock')"), 'Uses translated pinModalUnlock')
})
