import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

test('Issue #241: cordis.patch.yml disables OS directory-picker and mounts directory-picker-browse', () => {
  const patchPath = resolve(rootDir, 'cordis.patch.yml')
  assert.ok(fs.existsSync(patchPath), 'cordis.patch.yml must exist')
  const content = fs.readFileSync(patchPath, 'utf8')

  // Check disabled directory-picker
  assert.match(
    content,
    /- id:\s*directory-picker\s*\n\s*disabled:\s*true/,
    'must disable OS directory-picker'
  )

  // Check backend browse picker
  assert.match(
    content,
    /- id:\s*directory-picker-browse\s*\n\s*name:\s*['"]?@deepseek-ai\/dsh-host-directory-picker-browse['"]?/,
    'must mount @deepseek-ai/dsh-host-directory-picker-browse'
  )
  assert.match(
    content,
    /maxEntries:\s*1000/,
    'must configure maxEntries: 1000'
  )

  // Check client UI browse picker
  assert.match(
    content,
    /- id:\s*ui-directory-picker-browse\s*\n\s*name:\s*['"]?@deepseek-ai\/dsh-client-ui-directory-picker-browse['"]?/,
    'must mount @deepseek-ai/dsh-client-ui-directory-picker-browse'
  )

  // Check package.json declares bundle.patch
  const pkgPath = resolve(rootDir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.ok(pkg.files.includes('cordis.patch.yml'))
})
