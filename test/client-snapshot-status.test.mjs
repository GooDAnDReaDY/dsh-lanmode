import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

test('Issue #136: resolveSnapshot handles null, missing getSnapshot, and valid scope', async () => {
  const clientCode = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  let loaded = null
  const context = vm.createContext({
    window: {
      __ModuleLoader__: { load: (def) => { loaded = def } },
      location: { href: 'https://127.0.0.1:3080/', hostname: '127.0.0.1', port: '3080' },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    document: {
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: () => null,
      head: { appendChild: () => {} },
      createElement: () => ({ setAttribute: () => {} }),
    },
    navigator: { language: 'en' },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    fetch: () => Promise.resolve({ json: () => Promise.resolve([]) }),
  })
  vm.runInContext(clientCode, context)

  const mockReact = {
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  }

  const modExports = loaded.factory((mod) => (mod === 'react' ? mockReact : {}))
  const resolveSnapshot = modExports.resolveSnapshot
  assert.equal(typeof resolveSnapshot, 'function', 'resolveSnapshot should be an exported function')

  const toPlain = (obj) => JSON.parse(JSON.stringify(obj))

  // 1. null or undefined targetScope
  assert.deepEqual(toPlain(resolveSnapshot(null)), { status: 'unavailable', value: null })
  assert.deepEqual(toPlain(resolveSnapshot(undefined)), { status: 'unavailable', value: null })

  // 2. targetScope without getSnapshot
  assert.deepEqual(toPlain(resolveSnapshot({})), { status: 'unavailable', value: null })
  assert.deepEqual(toPlain(resolveSnapshot({ get: () => ({ mode: 'auto' }) })), { status: 'unavailable', value: null })

  // 3. targetScope with getSnapshot returning ready
  const readyScope = {
    getSnapshot() {
      return { status: 'ready', value: { mode: 'direct', directPort: 3088 } }
    },
  }
  assert.deepEqual(toPlain(resolveSnapshot(readyScope)), {
    status: 'ready',
    value: { mode: 'direct', directPort: 3088 },
  })

  // 4. targetScope with getSnapshot returning loading
  const loadingScope = {
    getSnapshot() {
      return { status: 'loading' }
    },
  }
  assert.deepEqual(toPlain(resolveSnapshot(loadingScope)), { status: 'loading' })
})

test('Issue #136: client.js does not contain the old masked fallback { status: "ready" }', () => {
  const clientCode = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.equal(
    clientCode.includes("{ status: 'ready', value: scope.get ? scope.get() : {} }"),
    false,
    'client.js must not fallback to { status: "ready" } when getSnapshot is absent',
  )
  assert.ok(
    clientCode.includes("snapStatus === 'unavailable'"),
    'client.js must handle snapStatus === "unavailable" in saveSettings and UI',
  )
})
