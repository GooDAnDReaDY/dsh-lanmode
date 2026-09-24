import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function loadHelpers() {
  const window = {}
  const context = vm.createContext({ window, console, URL, Promise })
  vm.runInContext(readFileSync(path.join(here, '..', 'lib', 'client-parts', '01-remote-helpers.js'), 'utf8'), context)
  return window.__DSH_LANMODE_PARTS
}

test('Issue #279: a binary file RPC downloads and returns a synthetic success', async () => {
  const helpers = loadHelpers()
  const clicks = []
  const win = {
    document: {
      body: {
        appendChild() {},
        removeChild() {},
      },
      createElement() {
        return {
          setAttribute(name, value) { this[name] = value },
          click() { clicks.push(this.href) },
          parentNode: { removeChild() {} },
        }
      },
    },
    fetch() {
      throw new Error('upstream fetch should not run')
    },
    Response: function Response(body, init) {
      this.body = body
      this.status = init.status
    },
  }
  helpers.installRemoteFileOpen(win)
  const res = await win.fetch('/auth/file?path=reports.zip')
  assert.equal(res.status, 200)
  assert.equal(clicks.length, 1)
  assert.equal(clicks[0], '/auth/file?path=reports.zip')
})

test('Issue #279: a text file RPC still uses the original fetch', async () => {
  const helpers = loadHelpers()
  let seen = ''
  const win = {
    document: { body: {}, createElement() { return { setAttribute() {}, click() {}, parentNode: null } } },
    fetch(input) {
      seen = input
      return Promise.resolve({ status: 200, ok: true })
    },
  }
  helpers.installRemoteFileOpen(win)
  const res = await win.fetch('/auth/file?path=notes.md')
  assert.equal(res.status, 200)
  assert.equal(seen, '/auth/file?path=notes.md')
})
