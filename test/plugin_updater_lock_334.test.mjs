import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { isPidAlive, checkProfileLock, registerPluginUpdater } from '../lib/plugin-updater.js'

test('Issue #334: plugin-updater does not contain minimumReleaseAge=0', () => {
  const updaterSource = fs.readFileSync(new URL('../lib/plugin-updater.js', import.meta.url), 'utf8')
  assert.ok(!updaterSource.includes('minimumReleaseAge=0'), 'minimumReleaseAge=0 must not be present')
})

test('Issue #334: checkProfileLock distinguishes live PID from dead PID and cleans stale lock', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-lock-test-'))
  try {
    const lockFile = path.join(tmpDir, 'package.json.lock')

    // 1. Live PID (current process)
    fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid }))
    const liveCheck = checkProfileLock(tmpDir)
    assert.equal(liveCheck.locked, true)
    assert.equal(liveCheck.pid, process.pid)
    assert.ok(fs.existsSync(lockFile), 'Lockfile with live PID must remain')

    // 2. Dead PID (Issue #414: must not delete lockfile or report unlocked via TOCTOU)
    const deadPid = 9999999
    fs.writeFileSync(lockFile, String(deadPid))
    const deadCheck = checkProfileLock(tmpDir)
    assert.equal(deadCheck.locked, true)
    assert.equal(deadCheck.pid, deadPid)
    assert.ok(fs.existsSync(lockFile), 'Lockfile must never be deleted by checkProfileLock')
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('Issue #334: Parallel update request returns 409 when profile lock is active', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-lock-409-'))
  const origProfileDir = process.env.DSH_PROFILE_DIR
  try {
    process.env.DSH_PROFILE_DIR = tmpDir
    fs.writeFileSync(path.join(tmpDir, 'package.json.lock'), JSON.stringify({ pid: process.pid }))

    let registeredRoute = null
    const fakeWebServer = {
      register(route) {
        registeredRoute = route
      }
    }

    registerPluginUpdater({ webServer: fakeWebServer }, {
      endpoint: '/api/dsh-lanmode/update',
      packageName: '@goodandready/dsh-lanmode',
      manifestUrl: new URL('../package.json', import.meta.url),
    })

    assert.ok(registeredRoute, 'Route must be registered')

    let statusCode = null
    let responseBody = ''
    const req = {
      method: 'POST',
      headers: {
        'x-dsh-plugin-update': '1',
        'sec-fetch-site': 'same-origin',
        origin: 'http://127.0.0.1:3080',
        host: '127.0.0.1:3080',
      },
      socket: { remoteAddress: '127.0.0.1' },
    }
    const res = {
      writeHead(code) { statusCode = code },
      end(body) { responseBody = body },
    }

    await registeredRoute.handler(req, res)
    assert.equal(statusCode, 409, 'Parallel installation with active PID lock must return 409')
    assert.ok(responseBody.includes('Another package installation is in progress'), 'Error message describes conflict')
  } finally {
    if (origProfileDir !== undefined) process.env.DSH_PROFILE_DIR = origProfileDir
    else delete process.env.DSH_PROFILE_DIR
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
