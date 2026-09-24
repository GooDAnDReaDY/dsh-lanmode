import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BanList, banRefusal, rejectBanned, SELF_LOCK } from '../lib/bans.js'
import { handleBridgeLocalRoutes } from '../lib/bridge-local.js'

const here = path.dirname(fileURLToPath(import.meta.url))

function mockRes() {
  return {
    status: 0,
    body: '',
    headers: {},
    writeHead(status, headers) { this.status = status; this.headers = headers || {} },
    end(body) { this.body = body || '' },
  }
}

test('Issue #256: loopback and the caller cannot be banned', () => {
  const list = new BanList()
  assert.equal(banRefusal('127.0.0.1', '10.1.1.1'), 'LOOPBACK')
  assert.equal(banRefusal('::1', '10.1.1.1'), 'LOOPBACK')
  assert.equal(banRefusal('::ffff:127.0.0.1', '10.1.1.1'), 'LOOPBACK')
  assert.equal(banRefusal('10.1.1.1', '10.1.1.1'), SELF_LOCK)
  assert.equal(banRefusal('::ffff:10.1.1.1', '10.1.1.1'), SELF_LOCK)
  assert.throws(() => list.ban('127.0.0.1', '10.9.9.9'), (err) => err.code === 'LOOPBACK')
  assert.throws(() => list.ban('10.9.9.9', '10.9.9.9'), (err) => err.code === SELF_LOCK)
  list.ban('10.2.2.2', '10.9.9.9')
  assert.equal(list.has('::ffff:10.2.2.2'), true)
})

test('Issue #256: a banned address is refused before the login page', () => {
  const list = new BanList(['10.2.2.2'])
  const res = mockRes()
  assert.equal(rejectBanned(res, list, '10.2.2.2'), true)
  assert.equal(res.status, 403)
  assert.equal(res.body, 'Forbidden')
  assert.equal(res.headers['content-type'], 'text/plain; charset=utf-8')
  assert.equal(String(res.body).includes('<'), false)
  const open = mockRes()
  assert.equal(rejectBanned(open, list, '10.3.3.3'), false)
  const bridge = readFileSync(path.join(here, '..', 'lib', 'bridge.js'), 'utf8')
  const banAt = bridge.indexOf('rejectBanned(res, options.banList, remote)')
  const welcomeAt = bridge.indexOf('if (!welcome(remote))')
  assert.ok(banAt > 0 && banAt < welcomeAt)
})

test('Issue #256: admin ban route stores the address and refuses self-lock', async () => {
  const list = new BanList()
  const saved = []
  const req = Readable.from([Buffer.from('{"ip":"10.4.4.4"}')])
  req.method = 'POST'
  req.url = '/dsh-lanmode/bans'
  const res = mockRes()
  handleBridgeLocalRoutes(req, res, {
    options: {
      banList: list,
      persistBans: () => saved.push(list.toJSON()),
    },
    remote: '10.9.9.9',
    role: 'admin',
    denyUnlessAdmin: () => true,
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(res.status, 200)
  assert.equal(list.has('10.4.4.4'), true)
  assert.deepEqual(saved[0], ['10.4.4.4'])

  const selfReq = Readable.from([Buffer.from('{"ip":"10.9.9.9"}')])
  selfReq.method = 'POST'
  selfReq.url = '/dsh-lanmode/bans'
  const selfRes = mockRes()
  handleBridgeLocalRoutes(selfReq, selfRes, {
    options: { banList: list },
    remote: '10.9.9.9',
    denyUnlessAdmin: () => true,
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(selfRes.status, 409)
  assert.equal(JSON.parse(selfRes.body).error, SELF_LOCK)
})
