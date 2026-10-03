import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { once } from 'node:events'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { apply } from '../lib/index.js'
import { cleanPack } from '../scripts/clean-pack.mjs'
import { ensureCertificate } from '../lib/tls.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const cleanScript = path.join(root, 'scripts/clean-pack.mjs')
const lintScript = path.join(root, 'scripts/lint.mjs')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

async function freePort() {
  const s = net.createServer()
  s.listen(0, '127.0.0.1')
  await once(s, 'listening')
  const p = s.address().port
  await new Promise((r) => s.close(r))
  return p
}

test('Issue #376: cleanPack handles concurrent deletion without throwing ENOENT', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-clean-pack-concurrency-'))
  try {
    const sub = path.join(tmpDir, 'subdir')
    fs.mkdirSync(sub)
    for (let i = 0; i < 30; i++) {
      fs.writeFileSync(path.join(tmpDir, `junk-${i}.tgz`), 'data')
      fs.writeFileSync(path.join(sub, `nested-${i}.tmp`), 'data')
    }

    const racers = []
    racers.push(Promise.resolve().then(() => cleanPack(tmpDir)))
    racers.push(Promise.resolve().then(() => cleanPack(tmpDir)))
    racers.push(
      (async () => {
        for (let i = 0; i < 15; i++) {
          try {
            fs.unlinkSync(path.join(tmpDir, `junk-${i}.tgz`))
          } catch {}
          try {
            fs.unlinkSync(path.join(sub, `nested-${i}.tmp`))
          } catch {}
          await delay(1)
        }
      })()
    )
    racers.push(Promise.resolve().then(() => cleanPack(tmpDir)))

    await assert.doesNotReject(Promise.all(racers))
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('Issue #376: clean-pack leaves repository root untouched when targeting fixture dir', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-clean-pack-isolation-'))
  const fixtureFile = path.join(tmpDir, 'test-bundle.tar.gz')
  fs.writeFileSync(fixtureFile, 'dummy')

  const run = spawnSync(process.execPath, [cleanScript, tmpDir], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr || run.stdout)
  assert.equal(fs.existsSync(fixtureFile), false, 'fixture junk file should be cleaned')

  assert.equal(fs.existsSync(path.join(root, '_tmp-pack-junk.tgz')), false)
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('Issue #376: parallel clean-pack test runs execute without race collisions', async () => {
  const runs = []
  const cleanPackTest = path.join(here, 'clean-pack-194.test.mjs')
  for (let i = 0; i < 4; i++) {
    runs.push(
      new Promise((resolve) => {
        const proc = spawnSync(process.execPath, ['--test', cleanPackTest], {
          cwd: root,
          encoding: 'utf8',
        })
        resolve(proc)
      })
    )
  }
  const results = await Promise.all(runs)
  for (const res of results) {
    assert.equal(res.status, 0, res.stderr || res.stdout)
  }
})

test('Issue #377: ESLint static gate detects deliberate undefined identifier', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-eslint-gate-'))
  const bogusFile = path.join(tmpDir, 'bogus.js')
  fs.writeFileSync(
    bogusFile,
    'export function check() { return undeclaredVariable123 + 456; }\n'
  )
  const miniConfig = path.join(tmpDir, 'eslint.config.mjs')
  fs.writeFileSync(
    miniConfig,
    `export default [
      {
        files: ["**/*.js"],
        languageOptions: { ecmaVersion: 2024, sourceType: "module" },
        rules: { "no-undef": "error" }
      }
    ];\n`
  )

  const eslintBin = path.join(root, 'node_modules', '.bin', 'eslint')
  const eslintCmd = fs.existsSync(eslintBin) ? eslintBin : 'eslint'
  const run = spawnSync(eslintCmd, ['bogus.js'], {
    cwd: tmpDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })

  try {
    assert.notEqual(run.status, 0, 'ESLint must fail on undefined identifier')
    assert.match(run.stdout + run.stderr, /'undeclaredVariable123' is not defined/)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('Issue #377: npm run lint / check:static passes cleanly across entire repository', () => {
  const run = spawnSync(process.execPath, [lintScript], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(run.status, 0, run.stderr || run.stdout)
  assert.match(run.stdout, /all syntax and static references clean/)
})

test('Issue #377: Gitea CI workflow file exists and defines quality gate steps', () => {
  const ciPath = path.join(root, '.gitea', 'workflows', 'ci.yml')
  assert.equal(fs.existsSync(ciPath), true, '.gitea/workflows/ci.yml must exist')
  const content = fs.readFileSync(ciPath, 'utf8')
  assert.match(content, /npm run check:static/, 'CI must run static checks / lint')
  assert.match(content, /npm test/, 'CI must run unit tests')
  assert.match(content, /npm run pack:check/, 'CI must verify pack hygiene')
})

test('Issue #377: TLS files mode genuinely establishes TLS listener without silent fallback', async () => {
  const certdir = path.join(os.tmpdir(), `dsh-cert-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await ensureCertificate({ dir: certdir, hosts: ['localhost', '127.0.0.1'], log() {} })
  const certPath = path.join(certdir, 'lanmode-cert.pem')
  const keyPath = path.join(certdir, 'lanmode-key.pem')

  const port = await freePort()
  const upstream = http.createServer((q, s) => {
    s.writeHead(200, { 'Content-Type': 'text/plain' })
    s.end('upstream-ok')
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')

  const logs = []
  const cleanups = []
  const ctx = {
    webServer: { port: upstream.address().port, register() { return () => {} }, tapIndex() { return () => {} } },
    logger: { info(x) { logs.push(x) }, warn(x) { logs.push(x) }, debug() {} },
    get() { return undefined },
    inject() { return () => {} },
    effect(fn) {
      const c = fn()
      if (typeof c === 'function') cleanups.push(c)
    },
  }

  try {
    const volatileCert = { get: () => certPath }
    const volatileKey = { get: () => keyPath }

    apply(ctx, {
      mode: 'direct',
      directHost: '127.0.0.1',
      directPort: port,
      tls: 'files',
      tlsCert: volatileCert,
      tlsKey: volatileKey,
      allow: ['127.0.0.0/8'],
      mdns: false,
    })

    await delay(200)

    const fallbackLogged = logs.some((l) => String(l).includes('starting without TLS'))
    assert.equal(fallbackLogged, false, 'Listener must not fall back to unencrypted HTTP')

    const resData = await new Promise((resolve, reject) => {
      const req = https.get(
        `https://127.0.0.1:${port}/test-tls`,
        { rejectUnauthorized: false, timeout: 2000 },
        (res) => {
          let body = ''
          res.on('data', (d) => { body += d })
          res.on('end', () => resolve({ status: res.statusCode, body }))
        }
      )
      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('HTTPS request timed out'))
      })
    })

    assert.equal(resData.status, 200, 'HTTPS endpoint must return status 200')
    assert.equal(resData.body, 'upstream-ok', 'HTTPS request must successfully reach upstream')
  } finally {
    for (const c of cleanups.reverse()) {
      try { await c() } catch {}
    }
    upstream.closeAllConnections()
    await new Promise((r) => upstream.close(r))
    try { fs.rmSync(certdir, { recursive: true, force: true }) } catch {}
  }
})
