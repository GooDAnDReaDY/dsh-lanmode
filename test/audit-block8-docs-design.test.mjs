import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(import.meta.dirname, '..')

function walkMarkdownFiles(dir) {
  let results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.worktrees') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results = results.concat(walkMarkdownFiles(full))
    } else if (entry.name.endsWith('.md')) {
      results.push(full)
    }
  }
  return results
}

test('Block 8 (Issue #378): All markdown links across repository resolve to valid files', () => {
  const mdFiles = walkMarkdownFiles(REPO_ROOT)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const brokenLinks = []

  for (const file of mdFiles) {
    const content = fs.readFileSync(file, 'utf8')
    const dir = path.dirname(file)
    let match
    while ((match = linkRegex.exec(content)) !== null) {
      const [_, label, rawLink] = match
      if (/^(https?:|mailto:|#)/.test(rawLink)) continue
      const cleanLink = rawLink.split('#')[0]
      if (!cleanLink) continue
      const resolved = path.resolve(dir, cleanLink)
      if (!fs.existsSync(resolved)) {
        brokenLinks.push({
          source: path.relative(REPO_ROOT, file),
          label,
          target: rawLink,
          resolved: path.relative(REPO_ROOT, resolved)
        })
      }
    }
  }

  assert.deepEqual(brokenLinks, [], `Found broken markdown links: ${JSON.stringify(brokenLinks, null, 2)}`)
})

test('Block 8 (Issue #378): Public README files contain no relative links to npm-excluded docs/ directory', () => {
  const publicReadmes = ['README.md', 'README.ru.md', 'README.zh.md']
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g

  for (const relName of publicReadmes) {
    const fullPath = path.join(REPO_ROOT, relName)
    const content = fs.readFileSync(fullPath, 'utf8')
    let match
    while ((match = linkRegex.exec(content)) !== null) {
      const [_, label, rawLink] = match
      if (/^(https?:|mailto:|#)/.test(rawLink)) continue
      assert.ok(
        !/(?:^|\/|^\.\/)docs\//.test(rawLink),
        `Public README ${relName} must not link to npm-excluded docs/: [${label}](${rawLink})`
      )
    }
  }
})

test('Block 8 (Issue #378): Version alignment across package.json, DESIGN.md, and index.md', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
  const version = pkg.version
  assert.ok(version, 'package.json must declare version')

  const designMd = fs.readFileSync(path.join(REPO_ROOT, 'docs/design/DESIGN.md'), 'utf8')
  assert.ok(
    designMd.includes(`(v${version})`),
    `DESIGN.md must declare active version (v${version})`
  )
  assert.ok(
    designMd.includes(`Release ${version}`),
    `DESIGN.md must have section for Release ${version}`
  )

  const indexMd = fs.readFileSync(path.join(REPO_ROOT, 'index.md'), 'utf8')
  assert.ok(
    indexMd.includes(`package version in \`package.json\` is \`${version}\``),
    `index.md must reference exact current package version ${version}`
  )
})

test('Block 8 (Issue #378): Auth documentation accuracy across en, ru, and zh READMEs', () => {
  const en = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8')
  const ru = fs.readFileSync(path.join(REPO_ROOT, 'README.ru.md'), 'utf8')
  const zh = fs.readFileSync(path.join(REPO_ROOT, 'README.zh.md'), 'utf8')

  // English assertions
  assert.match(en, /plaintext.*scrypt/i, 'README.md must document plaintext and scrypt password support')
  assert.match(en, /timingSafeEqual/i, 'README.md must document constant time password verification')
  assert.match(en, /PBKDF2/i, 'README.md must document PBKDF2 PIN stretching')
  assert.match(en, /SHA-256/i, 'README.md must document SHA-256 session and device token digest storage')

  // Russian assertions
  assert.match(ru, /открытый текст.*scrypt/i, 'README.ru.md must document plaintext and scrypt password support')
  assert.match(ru, /timingSafeEqual/i, 'README.ru.md must document constant time password verification')
  assert.match(ru, /PBKDF2/i, 'README.ru.md must document PBKDF2 PIN stretching')
  assert.match(ru, /SHA-256/i, 'README.ru.md must document SHA-256 session and device token digest storage')

  // Chinese assertions
  assert.match(zh, /纯文本.*scrypt/i, 'README.zh.md must document plaintext and scrypt password support')
  assert.match(zh, /timingSafeEqual/i, 'README.zh.md must document constant time password verification')
  assert.match(zh, /PBKDF2/i, 'README.zh.md must document PBKDF2 PIN stretching')
  assert.match(zh, /SHA-256/i, 'README.zh.md must document SHA-256 session and device token digest storage')
})

test('Block 8 (Issue #378): Cloudflare Tunnel & Quick QR documentation accuracy', () => {
  const en = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8')
  const ru = fs.readFileSync(path.join(REPO_ROOT, 'README.ru.md'), 'utf8')
  const zh = fs.readFileSync(path.join(REPO_ROOT, 'README.zh.md'), 'utf8')

  // Quick & Named Tunnels + tunnelPin
  assert.match(en, /Quick Tunnels.*Named Tunnels/i)
  assert.match(en, /tunnelPin/i)
  assert.match(ru, /Quick Tunnels.*Named Tunnels/i)
  assert.match(ru, /tunnelPin/i)
  assert.match(zh, /Quick Tunnel.*Named Tunnel/i)
  assert.match(zh, /tunnelPin/i)

  // Quick QR popover in sidebar footer
  assert.match(en, /Quick QR.*sidebar.footer/i)
  assert.match(ru, /Quick QR.*sidebar.footer/i)
  assert.match(zh, /Quick QR.*sidebar.footer/i)
})

test('Block 8 (Issue #378): Package manifest integrity and file boundary compliance', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
  const files = pkg.files || []

  // Required files present
  assert.ok(files.includes('lib/'), 'package.json must include lib/')
  assert.ok(files.includes('README.md'), 'package.json must include README.md')
  assert.ok(files.includes('README.zh.md'), 'package.json must include README.zh.md')
  assert.ok(files.includes('README.ru.md'), 'package.json must include README.ru.md')
  assert.ok(files.includes('LICENSE'), 'package.json must include LICENSE')

  // Forbidden / internal files strictly excluded
  assert.ok(!files.includes('AGENTS.md'), 'package.json must exclude AGENTS.md')
  assert.ok(!files.includes('index.md'), 'package.json must exclude index.md')
  assert.ok(!files.includes('docs/'), 'package.json must exclude docs/')
  assert.ok(!files.includes('test/'), 'package.json must exclude test/')
  assert.ok(!files.includes('scripts/'), 'package.json must exclude scripts/')
})
