import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertGuarded, unknownPluginPaths } from '../lib/route-guard.js'

function pluginPathsInSource(source) {
  const found = new Set()
  const re = /['"`](\/dsh-lanmode\/[A-Za-z0-9._~/-]+)['"`]/g
  for (const match of String(source || '').matchAll(re)) found.add(match[1])
  return [...found]
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function sources(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sources(full))
    else if (name.endsWith('.js')) out.push(readFileSync(full, 'utf8'))
  }
  return out
}

test('Issue #270: gated routes are not on the public list', () => {
  assert.equal(assertGuarded(), true)
})

test('Issue #270: a public prefix cannot be marked gated', () => {
  assert.throws(() => assertGuarded(['/dsh-lanmode/auth/login']), /unguarded routes/)
})

test('Issue #270: every plugin path literal is public, gated, or ignored', () => {
  const paths = [...new Set(sources(path.join(root, 'lib')).flatMap(pluginPathsInSource))]
  assert.deepEqual(unknownPluginPaths(paths), [])
})
