import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function loadHelpers() {
  const window = {}
  const context = vm.createContext({ window, console, URL })
  vm.runInContext(readFileSync(path.join(here, '..', 'lib', 'client-parts', '01-remote-helpers.js'), 'utf8'), context)
  return window.__DSH_LANMODE_PARTS
}

test('Issue #280: binary extensions download and text files do not', () => {
  const helpers = loadHelpers()
  assert.equal(helpers.shouldDownloadFile('/tmp/archive.zip'), true)
  assert.equal(helpers.shouldDownloadFile('C:\\dist\\app.exe'), true)
  assert.equal(helpers.shouldDownloadFile('notes.md'), false)
  assert.equal(helpers.shouldDownloadFile('photo.png'), false)
})

test('Issue #280: clicking a binary link marks it for download', () => {
  const helpers = loadHelpers()
  let handler = null
  const link = {
    href: '/auth/file?path=bundle.zip',
    getAttribute: () => '/auth/file?path=bundle.zip',
    setAttribute(name, value) { this[name] = value },
  }
  const doc = {
    addEventListener(type, fn) { if (type === 'click') handler = fn },
  }
  helpers.installBinaryDownload(doc)
  handler({ target: { closest: () => link } })
  assert.equal(link.download, '')
})
