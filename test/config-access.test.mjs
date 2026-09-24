import test from 'node:test'
import assert from 'node:assert/strict'
import { registerConfigApi } from '../lib/routes/config.js'
import { parseAllow } from '../lib/access.js'

function capture(ctxReady) {
  const routes = []
  const ctx = {
    effect(fn) { fn() },
    webServer: { register(route) { routes.push(route) } },
  }
  ctxReady(ctx)
  return routes[0].handler
}

function call(handler, { method, ip, body, headers }) {
  return new Promise((resolve) => {
    const req = {
      method,
      headers: headers || { host: '127.0.0.1' },
      socket: { remoteAddress: ip },
      on(event, cb) {
        if (event === 'data' && body != null) cb(body)
        if (event === 'end') cb()
      },
    }
    const res = {
      status: 0,
      payload: '',
      writeHead(status) { this.status = status },
      end(payload) { this.payload = payload || ''; resolve(this) },
    }
    handler(req, res)
  })
}

function guestState() {
  return {
    adminRules: parseAllow(['10.0.0.0/8']).rules,
    guestRules: parseAllow(['192.168.50.0/24']).rules,
    rules: [],
    passwordAuth: false,
    authManager: null,
  }
}

test('config API rejects a guest before reading or writing settings', async () => {
  const effective = { mode: 'direct', lanPin: 'secret-pin', authPassword: 'secret-pass' }
  let updates = 0
  const handler = capture((ctx) => {
    registerConfigApi(ctx, effective, () => { updates += 1 }, { state: guestState() })
  })

  const read = await call(handler, { method: 'GET', ip: '192.168.50.9' })
  assert.equal(read.status, 403)
  assert.equal(read.payload.includes('secret-pin'), false)

  const write = await call(handler, {
    method: 'PATCH',
    ip: '192.168.50.9',
    body: JSON.stringify({ mode: 'hijacked' }),
    headers: { host: '127.0.0.1', origin: 'http://127.0.0.1' },
  })
  assert.equal(write.status, 403)
  assert.equal(effective.mode, 'direct')
  assert.equal(updates, 0)
})

test('config API requires a session when password authentication is on', async () => {
  const effective = { mode: 'direct', passwordAuth: true, lanPin: 'secret-pin' }
  const state = {
    adminRules: [],
    guestRules: [],
    rules: [],
    passwordAuth: true,
    authManager: {
      extractToken() { return null },
      validateSession() { return null },
    },
  }
  const handler = capture((ctx) => {
    registerConfigApi(ctx, effective, () => {}, { state })
  })
  const read = await call(handler, { method: 'GET', ip: '127.0.0.1' })
  assert.equal(read.status, 401)
  assert.equal(read.payload.includes('secret-pin'), false)
})

test('config API returns a masked config to an administrator', async () => {
  const effective = { mode: 'direct', lanPin: 'secret-pin', passwordAuth: false }
  const state = {
    adminRules: parseAllow(['10.1.2.0/24']).rules,
    guestRules: [],
    rules: [],
    passwordAuth: false,
    authManager: null,
  }
  const handler = capture((ctx) => {
    registerConfigApi(ctx, effective, () => {}, { state })
  })
  const read = await call(handler, { method: 'GET', ip: '10.1.2.8' })
  assert.equal(read.status, 200)
  const body = JSON.parse(read.payload)
  assert.equal(body.value.mode, 'direct')
  assert.equal(body.value.lanPin, '***')
  assert.equal(body.value.lanPin === 'secret-pin', false)
})