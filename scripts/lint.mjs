#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const filesToCheck = []

function collect(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.worktrees') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collect(full)
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      filesToCheck.push(full)
    }
  }
}

collect(path.join(root, 'lib'))
collect(path.join(root, 'scripts'))
collect(path.join(root, 'test'))

// Step 1: Syntax check with node --check
let syntaxErrors = 0
for (const file of filesToCheck) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (res.status !== 0) {
    console.error(`[lint] Syntax error in ${path.relative(root, file)}:\n${res.stderr || res.stdout}`)
    syntaxErrors++
  }
}

if (syntaxErrors > 0) {
  console.error(`[lint] FAILED: ${syntaxErrors} file(s) have syntax errors out of ${filesToCheck.length} checked.`)
  process.exit(1)
}

// Step 2: ESLint static analysis (no-undef check)
const eslintBin = path.join(root, 'node_modules', '.bin', 'eslint')
const eslintCmd = fs.existsSync(eslintBin) ? eslintBin : 'eslint'
const eslintRes = spawnSync(eslintCmd, ['lib/', 'scripts/', 'test/'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
})

if (eslintRes.status !== 0) {
  console.error(`[lint] ESLint static analysis failed:\n${eslintRes.stderr || eslintRes.stdout}`)
  process.exit(eslintRes.status || 1)
}

console.log(`[lint] OK: checked ${filesToCheck.length} files across lib/, scripts/, test/ — all syntax and static references clean.`)
