import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const start = src.indexOf('function loadOutcome')
const end = src.indexOf('function takeJson')
const loadOutcome = new Function(src.slice(start, end) + '\nreturn loadOutcome;')()

test('a failed response is not treated as an empty success', () => {
  const http = loadOutcome({ ok: false, status: 403 }, { error: 'no' })
  assert.equal(http.ok, false)
  assert.equal(http.kind, 'http')
  assert.equal(http.status, 403)

  const empty = loadOutcome({ ok: true, status: 200 }, null)
  assert.equal(empty.ok, false)
  assert.equal(empty.kind, 'empty')

  const blank = loadOutcome({ ok: true, status: 200 }, '')
  assert.equal(blank.kind, 'empty')

  const list = loadOutcome({ ok: true, status: 200 }, [])
  assert.equal(list.ok, true)
  assert.deepEqual(list.body, [])
})

test('device, tunnel, updater, and health loads surface the failure', () => {
  for (const path of ['/dsh-lanmode/devices', '/dsh-lanmode/tunnel', '/api/dsh-lanmode/update', '/dsh-lanmode/health?format=json']) {
    const at = src.indexOf(path)
    assert.ok(at > 0, path)
    const window = src.slice(at, at + 700)
    assert.equal(window.includes('catch(function () {})'), false, path)
  }
  assert.match(src, /devicesError/)
  assert.match(src, /tunnelError/)
  assert.match(src, /setUpdaterErr\(loadMessage/)
  assert.match(src, /setRttError/)
  assert.match(src, /catch\(function \(\) \{\}\)/)
})