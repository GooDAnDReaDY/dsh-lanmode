import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

test('Issue #138: lib/client.js and lib/shim.js use DSH theme tokens without raw hardcoded colors', () => {
  const clientPath = resolve(rootDir, 'lib/client.js')
  const clientCode = fs.readFileSync(clientPath, 'utf8')

  // Check that dangerous raw color patterns are absent in standalone CSS/styles
  assert.equal(
    clientCode.includes('background:rgba(239,68,68,0.08)'),
    false,
    'raw error surface background must use var(--dsw-alias-state-error-surface)',
  )
  assert.equal(
    clientCode.includes('background:rgba(16,185,129,0.08)'),
    false,
    'raw success surface background must use var(--dsw-alias-state-success-surface)',
  )
  assert.equal(
    clientCode.includes('background:rgba(245,158,11,0.08)'),
    false,
    'raw warning surface background must use var(--dsw-alias-state-warning-surface)',
  )
  assert.equal(
    clientCode.includes("color: '#22c55e'"),
    false,
    'raw success text color must use var(--dsw-alias-state-success-primary)',
  )
  assert.equal(
    clientCode.includes("background: '#1e1e2e'"),
    false,
    'modal card background must use theme layer variables',
  )
  assert.equal(
    clientCode.includes("color: '#cdd6f4'"),
    false,
    'modal card text color must use theme label variables',
  )

  // Verify modal backdrop and card use CSS variables
  assert.ok(
    clientCode.includes('--dsw-alias-mask-bg'),
    'modal backdrop must use --dsw-alias-mask-bg',
  )
  assert.ok(
    clientCode.includes('--dsw-alias-shadow-l3'),
    'modal card shadow must use --dsw-alias-shadow-l3',
  )

  // Check lib/shim.js
  const shimPath = resolve(rootDir, 'lib/shim.js')
  const shimCode = fs.readFileSync(shimPath, 'utf8')

  assert.ok(
    shimCode.includes('--dsw-alias-mask-bg'),
    'PIN prompt backdrop must use --dsw-alias-mask-bg',
  )
  assert.ok(
    shimCode.includes('--dsw-alias-bg-layer-2'),
    'PIN prompt card must use theme background variables',
  )
  assert.ok(
    shimCode.includes('--dsw-alias-label-primary'),
    'PIN prompt must use theme label variables',
  )
})

test('Issue #140: package.json declares dsh.client.inject matching client runtime requirements', () => {
  const pkgPath = resolve(rootDir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

  assert.ok(pkg.dsh, 'package.json must contain dsh metadata')
  assert.ok(pkg.dsh.client, 'dsh metadata must contain client config')
  assert.ok(Array.isArray(pkg.dsh.client.inject), 'dsh.client.inject must be an array')

  const injects = pkg.dsh.client.inject
  assert.ok(
    injects.includes('@deepseek-ai/dsh-client-locale'),
    'inject must declare @deepseek-ai/dsh-client-locale',
  )
  assert.ok(
    injects.includes('@deepseek-ai/dsh-client-ui-slots'),
    'inject must declare @deepseek-ai/dsh-client-ui-slots',
  )
  assert.ok(
    !injects.includes('@deepseek-ai/dsh-client-ui-settings'),
    'inject must NOT declare @deepseek-ai/dsh-client-ui-settings anymore',
  )
})
