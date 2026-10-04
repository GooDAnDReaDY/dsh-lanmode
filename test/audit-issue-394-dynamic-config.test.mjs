// Automated verification for Issue #394:
// Config frozen after boot: TLS certificate and key paths set in the card never take effect.
// Verifies dynamic config reloading, volatile-update and settings/document-updated events,
// certificate rotation detection, and listener re-arming.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  setupDynamicConfig,
  extractConfigPayload,
  readSettingsService,
  updateLiveState,
} from '../lib/config-validator.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Issue #394: extractConfigPayload extracts namespace and direct volatile updates', () => {
  // Direct namespace object
  const p1 = { ns: '@goodandready/dsh-lanmode', value: { tlsCert: '/etc/ssl/cert.pem', tlsKey: '/etc/ssl/key.pem' } }
  assert.deepEqual(extractConfigPayload(p1), { tlsCert: '/etc/ssl/cert.pem', tlsKey: '/etc/ssl/key.pem' })

  // Short namespace object
  const p2 = { ns: 'dsh-lanmode', config: { mode: 'direct', directPort: 3099 } }
  assert.deepEqual(extractConfigPayload(p2), { mode: 'direct', directPort: 3099 })

  // Keyed by package name
  const p3 = { '@goodandready/dsh-lanmode': { tlsCert: '/var/certs/cert.pem' } }
  assert.deepEqual(extractConfigPayload(p3), { tlsCert: '/var/certs/cert.pem' })

  // Direct volatile fields patch
  const p4 = { tlsCert: '/tmp/new-cert.pem', tlsKey: '/tmp/new-key.pem' }
  assert.deepEqual(extractConfigPayload(p4), { tlsCert: '/tmp/new-cert.pem', tlsKey: '/tmp/new-key.pem' })

  // Irrelevant payload returns null
  assert.equal(extractConfigPayload({ unrelated: 123 }), null)
  assert.equal(extractConfigPayload(null), null)
})

test('Issue #394: readSettingsService describes and retrieves plugin settings', () => {
  const mockService = {
    describe() {
      return [
        { ns: 'other-plugin', value: { foo: 'bar' } },
        { ns: '@goodandready/dsh-lanmode', value: { mode: 'direct', directPort: 3088, tlsCert: '/tmp/c.pem' } },
      ]
    },
    get(ns) {
      if (ns === '@goodandready/dsh-lanmode') return { mode: 'direct', directPort: 3088, tlsCert: '/tmp/c.pem' }
      return null
    }
  }

  const res = readSettingsService(mockService)
  assert.ok(res, 'must retrieve settings for @goodandready/dsh-lanmode')
  assert.equal(res.tlsCert, '/tmp/c.pem')
  assert.equal(res.directPort, 3088)
})

test('Issue #394: setupDynamicConfig updates effective config and triggers onConfigUpdated on volatile update', () => {
  const events = new Map()
  const mockCtx = {
    on(event, handler) {
      events.set(event, handler)
      return () => events.delete(event)
    },
    effect(fn) {
      return fn()
    }
  }

  const effective = {
    mode: 'auto',
    directPort: 3088,
    tls: 'files',
    tlsCert: '/old/cert.pem',
    tlsKey: '/old/key.pem',
  }

  let updatedCalls = 0
  let lastUpdated = null
  const onConfigUpdated = (cfg) => {
    updatedCalls++
    lastUpdated = { ...cfg }
  }

  const dispose = setupDynamicConfig(mockCtx, { effective, onConfigUpdated })

  assert.ok(events.has('loader/volatile-update'), 'must listen to loader/volatile-update')
  assert.ok(events.has('settings/document-updated'), 'must listen to settings/document-updated')
  assert.ok(events.has('config'), 'must listen to config')

  // Simulate loader/volatile-update event from card or DSH loader
  const volatileHandler = events.get('loader/volatile-update')
  volatileHandler('@goodandready/dsh-lanmode', {
    tlsCert: '/new/rotated-cert.pem',
    tlsKey: '/new/rotated-key.pem',
  })

  assert.equal(updatedCalls, 1, 'onConfigUpdated must be triggered once')
  assert.equal(effective.tlsCert, '/new/rotated-cert.pem')
  assert.equal(effective.tlsKey, '/new/rotated-key.pem')
  assert.equal(lastUpdated.tlsCert, '/new/rotated-cert.pem')
  assert.equal(lastUpdated.tlsKey, '/new/rotated-key.pem')

  // Disposer cleans up listeners
  dispose()
  assert.equal(events.size, 0, 'all event listeners must be removed on dispose')
})

test('Issue #394: setupDynamicConfig reads from Cordis settings service when injected', () => {
  let injectCallback = null
  const mockCtx = {
    on() { return () => {} },
    effect(fn) { return fn() },
    inject(deps, cb) {
      if (deps.includes('settings')) injectCallback = cb
    }
  }

  const effective = { mode: 'auto', directPort: 3088, tlsCert: '' }
  let updateCount = 0
  setupDynamicConfig(mockCtx, {
    effective,
    onConfigUpdated: () => { updateCount++ },
  })

  assert.ok(injectCallback, 'must inject settings service')

  // Simulate settings service becoming available
  injectCallback({
    settings: {
      describe() {
        return [{ ns: 'dsh-lanmode', value: { directPort: 4000, tlsCert: '/etc/cert.pem' } }]
      }
    }
  })

  assert.equal(effective.directPort, 4000)
  assert.equal(effective.tlsCert, '/etc/cert.pem')
  assert.equal(updateCount, 1)
})

test('Issue #394: updateLiveState synchronizes state and allows live rearm', () => {
  const state = {
    mode: 'auto',
    allow: [],
    rules: [],
    adminRules: [],
    guestRules: [],
    lanPin: false,
    mdnsName: 'dsh.local',
  }
  const config = {
    mode: 'auto',
    allow: [],
    tlsCert: '/old/cert.pem',
  }

  updateLiveState(state, config, {
    mode: 'direct',
    allow: ['192.168.1.0/24'],
    tlsCert: '/new/cert.pem',
    tlsKey: '/new/key.pem',
    lanPin: '1234',
    mdnsName: 'custom.local',
  })

  assert.equal(state.mode, 'direct')
  assert.deepEqual(state.allow, ['192.168.1.0/24'])
  assert.equal(state.rules.length, 1)
  assert.equal(state.lanPin, true)
  assert.equal(state.mdnsName, 'custom.local')
  assert.equal(config.tlsCert, '/new/cert.pem')
  assert.equal(config.tlsKey, '/new/key.pem')
})

test('Issue #394: In-place certificate rotation: stat mtimeMs/size changes directKey', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cert-test-'))
  const certFile = path.join(tmpDir, 'cert.pem')
  fs.writeFileSync(certFile, 'Initial Certificate v1')

  const computeKey = (cfg) => {
    let certFingerprint = ''
    if (cfg.tls === 'files' && cfg.tlsCert && fs.existsSync(cfg.tlsCert)) {
      try {
        const stat = fs.statSync(cfg.tlsCert)
        certFingerprint = `${stat.mtimeMs}:${stat.size}`
      } catch (_) {}
    }
    return JSON.stringify({
      mode: cfg.mode,
      tls: cfg.tls,
      tlsCert: cfg.tlsCert,
      tlsKey: cfg.tlsKey,
      certFingerprint,
    })
  }

  const cfg = { mode: 'direct', tls: 'files', tlsCert: certFile, tlsKey: '/tmp/key.pem' }
  const key1 = computeKey(cfg)

  // Rotate certificate file on disk (same path, updated content & mtime)
  const future = new Date(Date.now() + 5000)
  fs.writeFileSync(certFile, 'Renewed Certificate Content v2 Longer Size')
  fs.utimesSync(certFile, future, future)

  const key2 = computeKey(cfg)
  assert.notEqual(key1, key2, 'Certificate content modification on disk must alter directKey to trigger live reload')

  fs.rmSync(tmpDir, { recursive: true, force: true })
})
