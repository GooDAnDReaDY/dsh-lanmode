import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const libDir = path.join(here, '..', 'lib')

test('Синтаксическая валидность всех файлов в lib/ (node --check)', () => {
  const files = fs.readdirSync(libDir).filter((f) => f.endsWith('.js'))
  assert.ok(files.length > 5, 'должно быть несколько файлов в lib/')

  for (const file of files) {
    const fullPath = path.join(libDir, file)
    assert.doesNotThrow(() => {
      execFileSync(process.execPath, ['--check', fullPath], { encoding: 'utf8' })
    }, `Файл ${file} должен успешно проходить node --check без SyntaxError`)
  }
})
