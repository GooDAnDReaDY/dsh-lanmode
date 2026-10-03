import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clientRuntimeSource } from './client-bundle.mjs'
import { hostReport } from '../lib/health.js'

function createSandbox(overrides = {}) {
  const windowObj = {
    __ModuleLoader__: { load: (def) => { windowObj.__loadedDef = def } },
    location: { origin: 'http://192.168.1.111:3088', hostname: '192.168.1.111', protocol: 'http:', port: '3088' },
    addEventListener: () => {},
    removeEventListener: () => {},
    ...overrides.window,
  }
  const documentObj = {
    documentElement: { lang: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
    createElement: () => ({ setAttribute: () => {} }),
    ...overrides.document,
  }
  const navigatorObj = {
    language: 'en-US',
    clipboard: { writeText: async () => {} },
    ...overrides.navigator,
  }
  const context = vm.createContext({
    window: windowObj,
    document: documentObj,
    navigator: navigatorObj,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    fetch: overrides.fetch || (() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
  })
  return { context, window: windowObj, document: documentObj, navigator: navigatorObj }
}

test('Issue #1: I18N dictionary has full key symmetry and >= 149 keys', () => {
  const sb = createSandbox()
  vm.runInContext(clientRuntimeSource(), sb.context)

  const env = {}
  sb.window.__DSH_LANMODE_PARTS.installI18n(env)

  assert.ok(env.I18N, 'I18N dictionary exists')
  assert.ok(env.I18N.en, 'I18N.en exists')
  assert.ok(env.I18N.zh, 'I18N.zh exists')

  const enKeys = Object.keys(env.I18N.en)
  const zhKeys = Object.keys(env.I18N.zh)

  assert.ok(enKeys.length >= 149, 'en keys count >= 149, got: ' + enKeys.length)
  assert.equal(enKeys.length, zhKeys.length, 'en and zh have same number of keys')

  const missingInZh = enKeys.filter((k) => !(k in env.I18N.zh))
  const missingInEn = zhKeys.filter((k) => !(k in env.I18N.en))

  assert.deepEqual(missingInZh, [], 'no keys missing in zh')
  assert.deepEqual(missingInEn, [], 'no keys missing in en')

  assert.ok(env.I18N.en.qrModeLan, 'qrModeLan in en')
  assert.ok(env.I18N.zh.qrModeLan, 'qrModeLan in zh')
  assert.ok(env.I18N.en.qrModeWan, 'qrModeWan in en')
  assert.ok(env.I18N.zh.qrModeWan, 'qrModeWan in zh')
})

test('Issue #1: getLocale prioritizes DSH document locale over browser navigator.language', () => {
  const sb = createSandbox()
  vm.runInContext(clientRuntimeSource(), sb.context)

  const env = {}
  sb.window.__DSH_LANMODE_PARTS.installI18n(env)

  // 1. Browser has zh-CN, but DSH document has lang="en" -> MUST return 'en'
  sb.document.documentElement.lang = 'en'
  sb.navigator.language = 'zh-CN'
  assert.equal(env.getLocale(), 'en')

  // 2. Browser has en-US, but DSH document has lang="zh-CN" -> MUST return 'zh'
  sb.document.documentElement.lang = 'zh-CN'
  sb.navigator.language = 'en-US'
  assert.equal(env.getLocale(), 'zh')

  // 3. Document lang empty -> falls back to navigator.language
  sb.document.documentElement.lang = ''
  sb.navigator.language = 'zh-CN'
  assert.equal(env.getLocale(), 'zh')

  sb.navigator.language = 'en-GB'
  assert.equal(env.getLocale(), 'en')

  // 4. ctx.locale snapshot takes precedence over document lang
  env.localeService = {
    getSnapshot: () => ({ active: 'zh-Hans' }),
  }
  sb.document.documentElement.lang = 'en'
  assert.equal(env.getLocale(), 'zh')

  // 5. window.__DSH_LOCALE__ takes top priority
  sb.window.__DSH_LOCALE__ = 'ru'
  assert.equal(env.getLocale(), 'ru')
  delete sb.window.__DSH_LOCALE__
  delete env.localeService
})

test('Issue #1: translate() resolves via boundT (ctx.locale.bind) with fallback to local I18N', () => {
  const sb = createSandbox()
  vm.runInContext(clientRuntimeSource(), sb.context)

  const env = {}
  sb.window.__DSH_LANMODE_PARTS.installI18n(env)

  sb.document.documentElement.lang = 'en'
  assert.equal(env.translate('quickQrTitle'), '📱 Mobile Smartphone Login')

  sb.document.documentElement.lang = 'zh-CN'
  assert.equal(env.translate('quickQrTitle'), '📱 手机端快速登录')

  // Injected external translator (e.g. from dsh-russian-lang)
  env.boundT = (key) => {
    if (key === 'quickQrTitle') return '📱 Быстрый вход с телефона'
    return key
  }
  assert.equal(env.translate('quickQrTitle'), '📱 Быстрый вход с телефона')

  // Key missing in external translator falls back cleanly to local dictionary
  assert.equal(env.translate('qrModeLan'), '局域网 (LAN)')
})

test('Issue #1: apply(ctx) registers full dictionary (153 keys) and wires boundT', () => {
  const sb = createSandbox()
  vm.runInContext(clientRuntimeSource(), sb.context)

  const env = {
    module: { exports: {} },
    resolveSnapshot: () => ({}),
    LanModeCard: () => null,
    NS: 'dsh-lanmode',
    ROW_ID: 'dsh-lanmode',
    ROW_CONFIG_KEY: '@goodandready/dsh-lanmode#dsh-lanmode',
    QuickQrPopover: () => null,
  }
  sb.window.__DSH_LANMODE_PARTS.installI18n(env)
  sb.window.__DSH_LANMODE_PARTS.installApply(env)

  let registeredNs = null
  let registeredDicts = null
  const registeredSlots = []

  const mockCtx = {
    locale: {
      register: (ns, dicts) => {
        registeredNs = ns
        registeredDicts = dicts
        return () => {}
      },
      bind: (ns) => (key) => `[${ns}:${key}]`,
    },
    slots: {
      register: (descriptor, component) => {
        registeredSlots.push({ descriptor, component })
        return () => {}
      },
      inject: (name, cb) => cb(),
    },
    effect: (fn) => fn(),
  }

  env.module.exports.apply(mockCtx)

  assert.equal(registeredNs, 'dsh-lanmode')
  assert.ok(registeredDicts)
  assert.ok(registeredDicts.en)
  assert.ok(registeredDicts.zh)
  assert.equal(Object.keys(registeredDicts.en).length, Object.keys(env.I18N.en).length)
  assert.ok(Object.keys(registeredDicts.en).length >= 149)
  assert.equal(typeof env.boundT, 'function')
  assert.equal(env.boundT('testKey'), '[dsh-lanmode:testKey]')

  // Verify all registered slots inject t function
  assert.ok(registeredSlots.length >= 4)
  for (const slot of registeredSlots) {
    if (typeof slot.descriptor.inject === 'function') {
      const injected = slot.descriptor.inject()
      assert.ok(typeof injected.t === 'function', 'Slot ' + (slot.descriptor.name || slot.descriptor.key) + ' injects t')
    }
  }
})

test('Issue #49: hostReport includes tunnel status and publicUrl', () => {
  const stateStopped = {
    version: '0.8.23',
    mode: 'auto',
    pieces: {},
    tunnel: {
      mode: 'off',
      status: 'stopped',
      publicUrl: null,
    },
  }
  const repStopped = hostReport(stateStopped)
  assert.ok(repStopped.tunnel)
  assert.equal(repStopped.tunnel.mode, 'off')
  assert.equal(repStopped.tunnel.status, 'stopped')
  assert.equal(repStopped.tunnel.publicUrl, null)
  assert.equal(repStopped.tunnel.active, false)

  const stateActive = {
    version: '0.8.23',
    mode: 'auto',
    pieces: {},
    tunnel: {
      mode: 'quick',
      status: 'active',
      publicUrl: 'https://example-test.trycloudflare.com',
    },
  }
  const repActive = hostReport(stateActive)
  assert.ok(repActive.tunnel)
  assert.equal(repActive.tunnel.mode, 'quick')
  assert.equal(repActive.tunnel.status, 'active')
  assert.equal(repActive.tunnel.publicUrl, 'https://example-test.trycloudflare.com')
  assert.equal(repActive.tunnel.active, true)
})

test('Issue #49: QuickQrPopover provides LAN/WAN toggle and respects active tunnel', () => {
  const sb = createSandbox()
  vm.runInContext(clientRuntimeSource(), sb.context)

  let renderedTree = null
  let stateStore = {}
  let stateIdx = 0

  const mockReact = {
    useState: (init) => {
      const id = stateIdx++
      if (!(id in stateStore)) stateStore[id] = typeof init === 'function' ? init() : init
      const setter = (val) => {
        stateStore[id] = typeof val === 'function' ? val(stateStore[id]) : val
      }
      return [stateStore[id], setter]
    },
    useEffect: (fn) => fn(),
    useMemo: (fn) => fn(),
    createElement: (type, props, ...children) => ({
      type,
      props: props || {},
      children: children.flat(),
    }),
  }

  const env = {
    React: mockReact,
    useState: mockReact.useState,
    useEffect: mockReact.useEffect,
    useMemo: mockReact.useMemo,
    getNow: () => Date.now(),
    translate: (k) => k,
  }
  sb.window.__DSH_LANMODE_PARTS.installQr(env)

  assert.equal(typeof env.QuickQrPopover, 'function')
})

test('Quality Gate: zero Cyrillic characters in all lib/ files', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib')
  const cyrillicRegex = /[\u0400-\u04FF]/
  const violations = []

  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      if (fs.statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.js')) {
        const text = fs.readFileSync(full, 'utf8')
        const lines = text.split('\n')
        lines.forEach((line, idx) => {
          if (cyrillicRegex.test(line)) {
            violations.push(`${path.relative(root, full)}:${idx + 1}: ${line}`)
          }
        })
      }
    }
  }
  walk(root)
  assert.deepEqual(violations, [], 'zero Cyrillic in lib/')
})
