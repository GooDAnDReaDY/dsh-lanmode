import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const source = readFileSync(new URL('../lib/shim.js', import.meta.url), 'utf8')

function wrap(apply, id = 'example-plugin') {
  let registered
  const sandbox = {
    window: {
      __DSH_LANMODE__: { settings: true },
      __ModuleLoader__: { load(value) { registered = value } },
    },
    location: { search: '', hostname: 'example.test' },
    URLSearchParams,
  }
  vm.runInNewContext(source, sandbox)
  sandbox.window.__ModuleLoader__.load({ id, factory: () => ({ apply }) })
  return registered.factory(() => {}).apply
}

function context() {
  const connection = { isLoopback: false }
  return { connection, get: () => connection }
}

test('async apply remains nonconstructible so a loader awaits startup', async () => {
  let mounted = false
  let finish
  const pending = new Promise(resolve => { finish = resolve })
  const original = async () => { await pending; mounted = true }
  const patched = wrap(original)
  assert.equal(patched.prototype, undefined)
  assert.throws(() => Reflect.construct(patched, [context()]), TypeError)
  const running = patched(context())
  assert.equal(mounted, false)
  finish()
  await running
  assert.equal(mounted, true)
})

test('method apply preserves this, config, extra arguments and disposer', () => {
  const ctx = context()
  const config = { enabled: true }
  const extra = {}
  const disposer = () => {}
  const receiver = {
    apply(...args) {
      assert.equal(this, receiver)
      assert.deepEqual(args, [ctx, config, extra])
      assert.equal(ctx.connection.isLoopback, true)
      return disposer
    },
  }
  const patched = wrap(receiver.apply)
  assert.equal(patched.prototype, undefined)
  assert.equal(Reflect.apply(patched, receiver, [ctx, config, extra]), disposer)
})

test('constructors preserve prototype, new.target, configuration and methods', () => {
  const ctx = context()
  const config = {}
  class Plugin {
    constructor(receivedCtx, receivedConfig) {
      assert.equal(new.target, patched)
      assert.equal(receivedCtx, ctx)
      assert.equal(receivedConfig, config)
      this.ready = receivedCtx.connection.isLoopback
    }
    dispose() { return 'disposed' }
  }
  const patched = wrap(Plugin)
  assert.equal(patched.prototype, Plugin.prototype)
  const instance = new patched(ctx, config)
  assert.ok(instance instanceof Plugin)
  assert.equal(instance.ready, true)
  assert.equal(instance.dispose(), 'disposed')
})

test('sync and async generators retain their kind and yielded lifecycle', async () => {
  function* sync(ctx, config) { yield config; return ctx.connection.isLoopback }
  async function* asyncGenerator(ctx, config) { yield config; return ctx.connection.isLoopback }
  for (const original of [sync, asyncGenerator]) {
    const patched = wrap(original)
    assert.equal(Object.getPrototypeOf(patched), Object.getPrototypeOf(original))
    assert.equal(patched.prototype, original.prototype)
    assert.throws(() => Reflect.construct(patched, [context()]), TypeError)
    const config = {}
    const iterator = patched(context(), config)
    assert.deepEqual(await iterator.next(), { value: config, done: false })
    assert.deepEqual(await iterator.next(), { value: true, done: true })
  }
})

test('excluded deliverables keep actual connection flag and all arguments', async () => {
  const ctx = context()
  ctx.connection.isLoopback = true
  const config = {}
  const original = async (received, receivedConfig) => {
    assert.equal(received.get('connection').isLoopback, false)
    assert.equal(received.connection.isLoopback, false)
    assert.equal(receivedConfig, config)
    return 'ready'
  }
  const patched = wrap(original, '@deepseek-ai/dsh-client-ui-deliverables')
  assert.equal(patched.prototype, undefined)
  assert.equal(await patched(ctx, config), 'ready')
  assert.equal(ctx.connection.isLoopback, true)
})

test('sync errors and rejected promises propagate unchanged', async () => {
  const failure = new Error('startup failed')
  const sync = wrap(() => { throw failure })
  assert.throws(() => sync(context()), error => error === failure)
  const rejected = Promise.reject(failure)
  const async = wrap(() => rejected)
  const result = async(context())
  assert.equal(result, rejected)
  await assert.rejects(result, error => error === failure)
})
