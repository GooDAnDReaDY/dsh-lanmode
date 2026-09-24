#!/usr/bin/env node
// Block release when the package or its declared dependencies use a copyleft license.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgPath = path.join(here, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

const BLOCKED = /\b(GPL|AGPL|LGPL|SSPL|Commons Clause)\b/i
const ALLOWED_SELF = /^(MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|Unlicense)$/i

const errors = []

if (!ALLOWED_SELF.test(String(pkg.license || ''))) {
  errors.push(`package license must stay permissive, got ${pkg.license}`)
}

function scanDeclared(sectionName) {
  const section = pkg[sectionName]
  if (!section || typeof section !== 'object') return
  for (const [name, range] of Object.entries(section)) {
    if (BLOCKED.test(name) || BLOCKED.test(String(range))) {
      errors.push(`${sectionName} entry looks copyleft: ${name}@${range}`)
    }
  }
}

scanDeclared('dependencies')
scanDeclared('optionalDependencies')
scanDeclared('peerDependencies')
scanDeclared('devDependencies')

const lockPath = path.join(here, '..', 'package-lock.json')
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
  const packages = lock.packages || {}
  for (const [key, meta] of Object.entries(packages)) {
    if (!meta || !meta.license) continue
    if (BLOCKED.test(String(meta.license))) {
      errors.push(`lockfile ${key || '(root)'} license ${meta.license}`)
    }
  }
}

if (errors.length) {
  console.error('License check failed:')
  for (const line of errors) console.error(' -', line)
  process.exit(1)
}

console.log('License check passed: package license is', pkg.license)
