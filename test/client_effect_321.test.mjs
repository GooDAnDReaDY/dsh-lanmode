import test from 'node:test'
import assert from 'node:assert/strict'
import { clientRuntimeSource } from './client-bundle.mjs'

test('Issue #321: client apply registers locales and slots inside ctx.effect when available', () => {
  const src = clientRuntimeSource()

  // Verify code contains ctx.effect calls for locales and slots
  assert.ok(src.includes("ctx.effect(registerLocales, NS + ': locales')"), 'registers locales via ctx.effect')
  assert.ok(src.includes("ctx.effect(doRegister, NS + ': slot ' + slotName)"), 'registers slots via ctx.effect')

  // Execute in isolated sandbox
  const effects = []
  const mockEffect = (fn, label) => {
    effects.push(label)
    return fn()
  }

  const localeRegistered = []
  const mockLocale = {
    register(ns, dict) {
      localeRegistered.push({ ns, dict })
    },
  }

  const slotRegistered = []
  const mockSlots = {
    inject(name, fn) {
      return fn()
    },
    register(spec, comp) {
      slotRegistered.push({ name: spec.name, id: spec.id, key: spec.key })
    },
  }

  const sandbox = {
    window: {
      __ModuleLoader__: { load: () => {} },
      __DSH_LANMODE_PARTS: {},
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    navigator: {},
    document: {
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  }

  const factoryFn = new Function('window', 'navigator', 'document', src + '\nreturn window.__DSH_LANMODE_PARTS;')
  const parts = factoryFn(sandbox.window, sandbox.navigator, sandbox.document)

  assert.equal(typeof parts.installApply, 'function')

  const mod = { exports: {} }
  const env = {
    module: mod,
    resolveSnapshot: () => ({}),
    LanModeCard: () => null,
    NS: 'dsh-lanmode',
    I18N: { en: { title: 'T', sub: 'S' }, zh: { title: 'T2', sub: 'S2' } },
    ROW_ID: 'row-id',
    ROW_CONFIG_KEY: 'row-key',
    QuickQrPopover: () => null,
    translate: (k) => k,
  }

  parts.installApply(env)
  assert.equal(typeof mod.exports.apply, 'function')

  // Run apply with mock ctx
  const ctx = {
    effect: mockEffect,
    locale: mockLocale,
    slots: mockSlots,
  }

  mod.exports.apply(ctx)

  // Verify effect invocations
  assert.ok(effects.includes('dsh-lanmode: locales'), 'locales registered via ctx.effect')
  assert.ok(effects.some((e) => e.includes('dsh-lanmode: slot plugins.item')), 'plugins.item registered via ctx.effect')
  assert.ok(effects.some((e) => e.includes('dsh-lanmode: slot plugins.row.config')), 'plugins.row.config registered via ctx.effect')
  assert.ok(effects.some((e) => e.includes('dsh-lanmode: slot settings.plugin.item')), 'settings.plugin.item registered via ctx.effect')
  assert.ok(effects.some((e) => e.includes('dsh-lanmode: slot sidebar.footer.action')), 'sidebar.footer.action registered via ctx.effect')

  assert.equal(localeRegistered.length, 1)
  assert.equal(localeRegistered[0].ns, 'dsh-lanmode')
})
