import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function loadHelpers() {
  const window = {}
  const context = vm.createContext({ window, console })
  vm.runInContext(readFileSync(path.join(here, '..', 'lib', 'client-parts', '01-remote-helpers.js'), 'utf8'), context)
  return window.__DSH_LANMODE_PARTS
}

test('Issue #235: welcome version is read only from the onboarding block', () => {
  const helpers = loadHelpers()
  assert.equal(helpers.welcomeVersion(null), null)
  assert.equal(helpers.welcomeVersion({ value: { 'ui-onboarding': { welcomeNoticeVersion: 3 } } }), 3)
  assert.equal(helpers.welcomeVersion({ 'ui-onboarding': { welcomeNoticeVersion: '' } }), null)
})

test('Issue #235: client acknowledges a known welcome version', () => {
  const src = readFileSync(path.join(here, '..', 'lib', 'client-parts', '09-apply.js'), 'utf8')
  assert.ok(src.includes('welcomeVersion'))
  assert.ok(src.includes('acknowledged: true'))
  assert.ok(src.includes('settings.onboarding'))
})

test('Issue #234: settings view falls back to schema and document', () => {
  const helpers = loadHelpers()
  assert.deepEqual(helpers.settingsView({ view: { ok: 1 } }), { ok: 1 })
  const mirrored = helpers.settingsView({ value: { schema: { a: 1 }, document: { b: 2 } } })
  assert.equal(mirrored.source, 'dsh-lanmode-mirror')
  assert.deepEqual(mirrored.document, { b: 2 })
  assert.equal(helpers.settingsView({ value: {} }), null)
})

test('Issue #246: locale preference is a trimmed string from string or event', () => {
  const helpers = loadHelpers()
  assert.equal(helpers.localePreference(' zh '), 'zh')
  assert.equal(helpers.localePreference({ preference: 'en' }), 'en')
  assert.equal(helpers.localePreference({}), null)
})
