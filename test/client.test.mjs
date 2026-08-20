// Проверяем не через браузер, а напрямую: клиентский файл — обычный модуль,
// который регистрируется в загрузчике. Подменяем загрузчик, забираем фабрику
// и вызываем её с поддельным require и поддельным ctx. Сеть при этом
// поддельная, поэтому проверяется именно логика: вывод раздела из документа,
// очередь записей и подстановка ответа обратно в зеркало.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

/** Выполняет client.js в песочнице и возвращает его exports. */
function loadClient() {
  let captured
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (entry) => { captured = entry } },
      localStorage: { getItem: () => null },
    },
    console: { info() {}, error() {} },
    location: { hostname: 'example.lan' },
  }
  // eslint-disable-next-line no-new-func
  new Function('window', 'console', 'location', source)(sandbox.window, sandbox.console, sandbox.location)
  assert.ok(captured, 'бандл не зарегистрировал себя в загрузчике')
  assert.equal(captured.id, '@goodandready/dsh-lanmode')
  return captured.factory(() => { throw new Error('внешних модулей быть не должно') })
}

/** Поддельный ctx: собирает объявленные службы и выданные эффекты. */
function makeCtx({ isLoopback = false, api }) {
  const provided = new Map()
  return {
    provided,
    get: (name) => (name === 'connection' ? { isLoopback, api } : provided.get(name)),
    provide: (name, value) => {
      if (provided.has(name)) throw new Error(`service "${name}" has been registered`)
      provided.set(name, value)
    },
    effect: () => () => {},
  }
}

const VIEW = {
  writable: true,
  hasDocument: true,
  namespaces: [
    { ns: 'dsh-voice', value: { language: 'ru' }, base: { language: 'en' }, user: { language: 'ru' }, revision: 3 },
  ],
}

function makeApi(overrides = {}) {
  const calls = []
  return {
    calls,
    settings: {
      describe: async (arg) => { calls.push(['describe', arg]); return { result: { ok: true, value: VIEW } } },
      mutate: async (arg) => {
        calls.push(['mutate', arg])
        if (overrides.mutate) return overrides.mutate(arg)
        return { result: { ok: true, value: { ...VIEW.namespaces[0], value: { language: 'en' }, revision: 4 } } }
      },
    },
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test('на loopback-странице плагин не вмешивается', () => {
  const client = loadClient()
  const ctx = makeCtx({ isLoopback: true, api: makeApi() })
  client.apply(ctx)
  assert.equal(ctx.provided.size, 0)
})

test('на прочих страницах объявляет свою службу', async () => {
  const client = loadClient()
  const ctx = makeCtx({ isLoopback: false, api: makeApi() })
  client.apply(ctx)
  assert.ok(ctx.provided.has('lanSettings'))
  assert.equal(typeof ctx.provided.get('lanSettings').bind, 'function')
  assert.equal(typeof ctx.provided.get('lanSettings').describe, 'function')
})

test('раздел выводится из документа со всеми слоями', async () => {
  const client = loadClient()
  const api = makeApi()
  const ctx = makeCtx({ isLoopback: false, api })
  client.apply(ctx)
  const scope = ctx.provided.get('lanSettings').bind({ namespace: 'dsh-voice' })
  await settle()
  const snap = scope.getSnapshot()
  assert.equal(snap.status, 'ready')
  assert.deepEqual(snap.value, { language: 'ru' })
  assert.deepEqual(snap.base, { language: 'en' })
  assert.deepEqual(snap.user, { language: 'ru' })
  assert.equal(snap.revision, 3)
  assert.equal(snap.writable, true)
})

test('неизвестный хосту раздел помечается как отсутствующий, а не как пустой', async () => {
  const client = loadClient()
  const ctx = makeCtx({ isLoopback: false, api: makeApi() })
  client.apply(ctx)
  const scope = ctx.provided.get('lanSettings').bind({ namespace: 'нет-такого' })
  await settle()
  assert.equal(scope.getSnapshot().status, 'unavailable')
  assert.equal(scope.getSnapshot().value, undefined)
})

test('запись уходит с текущей ревизией и подставляет ответ обратно', async () => {
  const client = loadClient()
  const api = makeApi()
  const ctx = makeCtx({ isLoopback: false, api })
  client.apply(ctx)
  const scope = ctx.provided.get('lanSettings').bind({ namespace: 'dsh-voice' })
  await settle()
  await scope.set('language', 'en')
  const mutate = api.calls.find(([name]) => name === 'mutate')[1]
  assert.equal(mutate.ns, 'dsh-voice')
  assert.deepEqual(mutate.ops, [{ op: 'set', path: ['language'], value: 'en' }])
  assert.equal(mutate.expectedRevision, 3)
  // Ответ вложен в зеркало без повторного чтения всего документа.
  assert.equal(api.calls.filter(([name]) => name === 'describe').length, 1)
  assert.deepEqual(scope.getSnapshot().value, { language: 'en' })
  assert.equal(scope.getSnapshot().revision, 4)
})

test('отказ записи перечитывает документ и доносит причину', async () => {
  const client = loadClient()
  const api = makeApi({ mutate: () => ({ result: { ok: false, error: { message: 'revision mismatch' } } }) })
  const ctx = makeCtx({ isLoopback: false, api })
  client.apply(ctx)
  const scope = ctx.provided.get('lanSettings').bind({ namespace: 'dsh-voice' })
  await settle()
  await assert.rejects(() => scope.set('language', 'en'), /revision mismatch/)
  assert.equal(api.calls.filter(([name]) => name === 'describe').length, 2)
})
