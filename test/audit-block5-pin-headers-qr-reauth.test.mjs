import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { getCategorizedInterfaces } from '../lib/network-interfaces.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const shimSource = fs.readFileSync(path.join(here, '..', 'lib', 'shim.js'), 'utf8')
const helpersSource = fs.readFileSync(path.join(here, '..', 'lib', 'client-parts', '01-remote-helpers.js'), 'utf8')

function createShimEnvironment(customFetch) {
  let modalNode = null
  let cardNode = null
  const inputEl = { value: '87654321', focus() {} }
  const cancelEl = { onclick: null }
  const submitEl = { onclick: null }

  const makeElement = (tag) => ({
    tag,
    style: {},
    children: [],
    appendChild(child) {
      this.children.push(child)
      if (child.id === 'dsh-pin-modal') modalNode = child
      cardNode = child
    },
    querySelector(selector) {
      if (selector === '#dsh-pin-input') return inputEl
      if (selector === '#dsh-pin-cancel') return cancelEl
      if (selector === '#dsh-pin-submit') return submitEl
      return null
    },
  })

  const doc = {
    cookie: '',
    getElementById(id) {
      if (id === 'dsh-pin-modal') return modalNode
      return null
    },
    createElement: makeElement,
    body: {
      appendChild(node) {
        modalNode = node
        node.parentNode = {
          removeChild(target) {
            if (target === modalNode) modalNode = null
          },
        }
      },
    },
  }

  const win = {
    __DSH_LANMODE__: { settings: false, randomUuid: false, clipboard: false },
    location: { href: '/chat?draft=hello_world', search: '', hostname: 'mini.local' },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null },
      setItem(k, v) { this._data[k] = String(v) },
    },
    fetch: customFetch,
    dispatchEvent(evt) {},
  }

  const sandbox = {
    window: win,
    document: doc,
    navigator: {},
    location: win.location,
    localStorage: win.localStorage,
    console,
    Headers,
    Request,
    CustomEvent: globalThis.CustomEvent,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    Promise,
  }

  vm.runInNewContext(shimSource, sandbox)

  return {
    win,
    doc,
    inputEl,
    cancelEl,
    submitEl,
    getModal: () => modalNode,
  }
}

test('Issue #374: fetch retry after PIN preserves Headers instance (Authorization and Content-Type)', async () => {
  let callCount = 0
  let retryHeaders = null

  const env = createShimEnvironment(async (resource, init) => {
    callCount++
    if (callCount === 1) {
      return {
        status: 403,
        headers: new Headers({ 'x-dsh-lan-pin-required': '1' }),
      }
    }
    retryHeaders = init && init.headers
    return {
      status: 200,
      headers: new Headers(),
    }
  })

  const origHeaders = new Headers({
    'content-type': 'application/json',
    'authorization': 'Bearer test-token-123',
    'x-custom-metric': 'active',
  })

  const fetchPromise = env.win.fetch('/api/privileged/settings', {
    method: 'POST',
    headers: origHeaders,
    body: JSON.stringify({ key: 'val' }),
  })

  await new Promise((r) => setTimeout(r, 20))
  assert.ok(env.getModal(), 'PIN modal should be rendered')

  env.inputEl.value = '12345678'
  env.submitEl.onclick()

  const res = await fetchPromise
  assert.equal(res.status, 200)
  assert.equal(callCount, 2)
  assert.ok(retryHeaders, 'Retry headers must be present')

  const parsed = new Headers(retryHeaders)
  assert.equal(parsed.get('content-type'), 'application/json')
  assert.equal(parsed.get('authorization'), 'Bearer test-token-123')
  assert.equal(parsed.get('x-custom-metric'), 'active')
  assert.equal(parsed.get('x-dsh-lan-pin'), '12345678')
})

test('Issue #374: fetch retry after PIN preserves headers when resource is a Request object', async () => {
  let callCount = 0
  let retryHeaders = null

  const env = createShimEnvironment(async (resource, init) => {
    callCount++
    if (callCount === 1) {
      return {
        status: 403,
        headers: new Headers({ 'x-dsh-lan-pin-required': '1' }),
      }
    }
    retryHeaders = (init && init.headers) || (resource && resource.headers)
    return {
      status: 200,
      headers: new Headers(),
    }
  })

  const req = new Request('http://localhost:3088/api/req-endpoint', {
    method: 'POST',
    headers: new Headers({
      'content-type': 'text/plain',
      'authorization': 'Bearer from-request-obj',
    }),
    body: 'payload',
  })

  const fetchPromise = env.win.fetch(req)
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(env.getModal())

  env.inputEl.value = '9999'
  env.submitEl.onclick()

  const res = await fetchPromise
  assert.equal(res.status, 200)

  const parsed = new Headers(retryHeaders)
  assert.equal(parsed.get('content-type'), 'text/plain')
  assert.equal(parsed.get('authorization'), 'Bearer from-request-obj')
  assert.equal(parsed.get('x-dsh-lan-pin'), '9999')
})

test('Issue #201: cancel PIN modal resolves pending and concurrent requests with 403 and cleans up', async () => {
  let callCount = 0
  const env = createShimEnvironment(async (resource, init) => {
    callCount++
    return {
      status: 403,
      headers: new Headers({ 'x-dsh-lan-pin-required': '1' }),
    }
  })

  let req1Done = false
  let req2Done = false

  const p1 = env.win.fetch('/api/req1').then((res) => {
    req1Done = true
    return res
  })
  const p2 = env.win.fetch('/api/req2').then((res) => {
    req2Done = true
    return res
  })

  await new Promise((r) => setTimeout(r, 20))
  assert.ok(env.getModal(), 'PIN modal is open')
  assert.equal(req1Done, false)
  assert.equal(req2Done, false)

  // User clicks Cancel
  env.cancelEl.onclick()

  await new Promise((r) => setTimeout(r, 20))
  assert.equal(env.getModal(), null, 'PIN modal closed after Cancel')

  const res1 = await p1
  const res2 = await p2
  assert.equal(req1Done, true, 'First request completed')
  assert.equal(req2Done, true, 'Second concurrent request completed')
  assert.equal(res1.status, 403)
  assert.equal(res2.status, 403)
})

test('Issue #201: single PIN unlock resolves multiple queued concurrent requests', async () => {
  let callCount = 0
  const env = createShimEnvironment(async (resource, init) => {
    callCount++
    if (callCount <= 2) {
      return {
        status: 403,
        headers: new Headers({ 'x-dsh-lan-pin-required': '1' }),
      }
    }
    return {
      status: 200,
      headers: new Headers(),
    }
  })

  const p1 = env.win.fetch('/api/queue1')
  const p2 = env.win.fetch('/api/queue2')

  await new Promise((r) => setTimeout(r, 20))
  assert.ok(env.getModal())

  env.inputEl.value = '5555'
  env.submitEl.onclick()

  const [res1, res2] = await Promise.all([p1, p2])
  assert.equal(res1.status, 200)
  assert.equal(res2.status, 200)
  assert.equal(env.getModal(), null)
})

test('Issue #240: 401 with x-dsh-auth-required retains location.href and dispatches auth event without hard redirect', async () => {
  let dispatched = false
  const env = createShimEnvironment(async () => {
    return {
      status: 401,
      headers: new Headers({ 'x-dsh-auth-required': '1' }),
    }
  })
  env.win.dispatchEvent = (evt) => {
    if (evt && evt.type === 'dsh:auth-required') dispatched = true
  }

  const initialHref = env.win.location.href
  const res = await env.win.fetch('/api/chat/message')

  assert.equal(res.status, 401)
  assert.equal(env.win.location.href, initialHref, 'URL must not change to /')
  assert.equal(dispatched, true, 'CustomEvent dsh:auth-required must be dispatched')
})

test('Issue #375: getCategorizedInterfaces respects custom mdnsName and provides dual category/name keys', () => {
  const ifaces = getCategorizedInterfaces(['192.168.1.50', '2001:db8::5'], { mdnsName: 'custombox.local' })
  assert.ok(Array.isArray(ifaces))

  const mdnsItem = ifaces.find((i) => i.address === 'custombox.local')
  assert.ok(mdnsItem, 'Custom mdnsName must be in the list')
  assert.equal(mdnsItem.category, 'mdns')
  assert.equal(mdnsItem.type, 'mdns')
  assert.equal(mdnsItem.name, 'mDNS (custombox.local)')
  assert.equal(mdnsItem.label, 'mDNS (custombox.local)')

  for (const item of ifaces) {
    assert.ok(item.category, `category must be defined for ${item.address}`)
    assert.equal(item.category, item.type, 'category and type must be identical')
    assert.ok(item.name, `name must be defined for ${item.address}`)
    assert.equal(item.name, item.label, 'name and label must be identical')
  }
})