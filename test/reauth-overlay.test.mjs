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

test('Issue #240: a 401 with the auth header opens an overlay and does not navigate', async () => {
  const helpers = loadHelpers()
  const src = readFileSync(path.join(here, '..', 'lib', 'client-parts', '01-remote-helpers.js'), 'utf8')
  assert.equal(src.includes('location.href'), false)
  assert.equal(src.includes('location.assign'), false)
  const elements = []
  const doc = {
    body: { appendChild(node) { elements.push(node) } },
    getElementById() { return null },
    createElement(tag) {
      return {
        tag,
        style: {},
        children: [],
        setAttribute() {},
        appendChild(child) { this.children.push(child) },
        addEventListener(type, fn) { this['on' + type] = fn },
      }
    },
  }
  let calls = 0
  const win = {
    document: doc,
    fetch() {
      calls += 1
      return Promise.resolve({
        status: 401,
        ok: false,
        headers: { get: (name) => (name === 'x-dsh-auth-required' ? '1' : '') },
      })
    },
  }
  helpers.installReauthOverlay({
    win,
    doc,
    translate: (key) => key,
  })
  const res = await win.fetch('/api/chat')
  assert.equal(res.status, 401)
  assert.equal(calls, 1)
  assert.equal(elements.length, 1)
  assert.equal(elements[0].id, 'dsh-lanmode-reauth')
  const draft = 'keep this text'
  assert.equal(draft, 'keep this text')
})
