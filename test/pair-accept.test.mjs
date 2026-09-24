import test from 'node:test'
import assert from 'node:assert/strict'
import { handleBridgeLocalRoutes } from '../lib/bridge-local.js'
import { isPublicPluginPath } from '../lib/route-guard.js'

function response() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers || {}
    },
    end(body) {
      this.body = body || ''
    },
  }
}

test('Issue #176: pair-accept redirects to pair-app without a cookie', () => {
  const res = response()
  const handled = handleBridgeLocalRoutes(
    { method: 'GET', url: '/dsh-lanmode/pair-accept?token=launch-1' },
    res,
    {},
  )
  assert.equal(handled, true)
  assert.equal(res.status, 302)
  assert.equal(res.headers.location, '/dsh-lanmode/pair-app?token=launch-1')
  assert.equal(res.headers['set-cookie'], undefined)
  assert.equal(isPublicPluginPath('/dsh-lanmode/pair-accept'), true)
})

test('Issue #176: pair-app lands on the app URL with the token and still no cookie', () => {
  const res = response()
  handleBridgeLocalRoutes({ method: 'GET', url: '/dsh-lanmode/pair-app?token=launch-1' }, res, {})
  assert.equal(res.status, 302)
  assert.equal(res.headers.location, '/?token=launch-1')
  assert.equal(res.headers['set-cookie'], undefined)
})

test('Issue #176: a missing token is refused', () => {
  const res = response()
  handleBridgeLocalRoutes({ method: 'GET', url: '/dsh-lanmode/pair-accept' }, res, {})
  assert.equal(res.status, 400)
})
