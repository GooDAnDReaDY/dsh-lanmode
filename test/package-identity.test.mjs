import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

test('Issue #133: Package identity matches across all 4 canonical places', () => {
  // 1. package.json
  const pkgPath = resolve(rootDir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const expectedName = pkg.name
  assert.equal(expectedName, '@goodandready/dsh-lanmode', 'package.json name must be scoped')

  // 2. cordis.patch.yml
  const patchPath = resolve(rootDir, 'cordis.patch.yml')
  const patchContent = fs.readFileSync(patchPath, 'utf8')
  const nonCommentLines = patchContent.split('\n').filter(line => !line.trim().startsWith('#')).join('\n')
  const patchMatch = nonCommentLines.match(/name:\s*['"]?([^'"\s]+)['"]?/)
  assert.ok(patchMatch, 'cordis.patch.yml must declare name:')
  const patchName = patchMatch[1]
  assert.equal(patchName, expectedName, 'cordis.patch.yml name must match package.json')

  // 3. lib/client.js (__ModuleLoader__.load)
  const clientPath = resolve(rootDir, 'lib/client.js')
  const clientContent = fs.readFileSync(clientPath, 'utf8')
  const clientMatch = clientContent.match(/__ModuleLoader__\.load\(\s*\{\s*id:\s*['"]([^'"]+)['"]/)
  assert.ok(clientMatch, 'lib/client.js must register loader id')
  const clientId = clientMatch[1]
  assert.equal(clientId, expectedName, 'lib/client.js loader id must match package.json')

  // 4. lib/index.js (export const name)
  const indexPath = resolve(rootDir, 'lib/index.js')
  const indexContent = fs.readFileSync(indexPath, 'utf8')
  const indexMatch = indexContent.match(/export\s+const\s+name\s*=\s*['"]([^'"]+)['"]/)
  assert.ok(indexMatch, 'lib/index.js must declare export const name')
  const indexName = indexMatch[1]
  assert.equal(indexName, expectedName, 'lib/index.js export const name must match package.json')
})
