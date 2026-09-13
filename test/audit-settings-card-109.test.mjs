import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

test('Issue #109: LanModeCard предоставляет доступ ко всем 25 полям схемы и сохраняет их', async () => {
  const clientCode = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  let loaded = null
  const context = vm.createContext({
    window: {
      __ModuleLoader__: { load: (def) => { loaded = def } },
      location: { href: 'https://192.168.1.111:3088/', hostname: '192.168.1.111', port: '3088' },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    document: {
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: () => null,
      head: { appendChild: () => {} },
      createElement: (tag) => ({
        setAttribute: (name, val) => {
          if (tag === 'style' && name === 'data-dsh-plugin') {
            assert.equal(val, 'dsh-lanmode', 'Style tag must have data-dsh-plugin="dsh-lanmode"')
          }
        },
      }),
    },
    navigator: {},
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    fetch: () => Promise.resolve({ json: () => Promise.resolve([]) }),
  })
  vm.runInContext(clientCode, context)

  const states = []
  let cursor = 0
  const effects = []

  const mockReact = {
    useState: (initial) => {
      const idx = cursor++
      if (states[idx] === undefined) {
        states[idx] = typeof initial === 'function' ? initial() : initial
      }
      const val = states[idx]
      const setter = (next) => {
        const newVal = typeof next === 'function' ? next(states[idx]) : next
        states[idx] = newVal
      }
      return [val, setter]
    },
    useEffect: (fn) => {
      effects.push(fn)
    },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  }

  const modExports = loaded.factory((mod) => (mod === 'react' ? mockReact : {}))

  let registeredComponent = null
  const setCalls = []
  const mockScope = {
    getSnapshot: () => ({
      status: 'ready',
      value: {
        mode: 'direct',
        directPort: 3088,
        tls: 'files',
        tlsHosts: ['dsh.example.org'],
        tlsCert: '/tmp/cert.pem',
        tlsKey: '/tmp/key.pem',
        allow: ['192.168.1.0/24'],
        unlockPrivileged: true,
        lanPinRef: 'MY_PIN_REF',
        privilegedExtra: ['/api/secret'],
        streamTimeoutMs: 5000,
        mdns: true,
        mdnsName: 'dsh.local',
        pwa: true,
        mobileEnterSends: false,
        diagnostics: true,
        settings: true,
        randomUuid: true,
        clipboard: true,
        passwordAuth: true,
        authUser: 'admin',
        authPassword: 'secretpassword',
        authPasswordRef: 'MY_AUTH_REF',
        authSessionDays: 30,
        tunnel: 'quick',
        tunnelTokenRef: 'MY_TUNNEL_REF',
        tunnelPin: true,
      },
    }),
    subscribe: () => () => {},
    set: async (k, v) => {
      setCalls.push({ k, v })
    },
  }

  // Проверяем, что get('settingsScope') работает
  const mockCtx = {
    locale: { register: () => {} },
    slots: {
      inject: (name, cb) => cb(),
      register: (opts, comp) => {
        if (opts.name === 'settings.plugin.item') {
          registeredComponent = comp
        }
      },
    },
    get: (serviceName) => {
      if (serviceName === 'settingsScope') return { bind: () => mockScope }
      return null
    },
  }

  modExports.apply(mockCtx)
  assert.ok(registeredComponent, 'LanModeCard обязан зарегистрироваться')

  // 1-й проход рендера для инициализации хуков и запуска useEffect
  cursor = 0
  states[0] = true // open = true
  registeredComponent({ ctx: mockCtx, t: (k) => k })

  // Запуск эффектов (заполняет draft из snapshot.value)
  while (effects.length > 0) {
    const eff = effects.shift()
    eff()
  }

  // 2-й проход рендера с уже заполненным состоянием draft
  cursor = 0
  const tree = registeredComponent({ ctx: mockCtx, t: (k) => k })
  assert.ok(tree)

  // Находим кнопку сохранения настроек
  function findSaveButton(node) {
    if (!node || typeof node !== 'object') return null
    if (node.type === 'button') {
      const text = Array.isArray(node.children) ? node.children.join('') : ''
      if (text.includes('Save Settings') || text.includes('Сохранить настройки') || text.includes('saveSettings')) return node
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = findSaveButton(child)
        if (found) return found
      }
    }
    return null
  }

  const saveBtn = findSaveButton(tree)
  assert.ok(saveBtn, 'Кнопка "Сохранить настройки" обязана присутствовать в карточке')
  assert.equal(typeof saveBtn.props.onClick, 'function')

  saveBtn.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 50))

  const savedKeys = setCalls.map((c) => c.k)
  const expectedKeys = [
    'mode', 'directPort', 'tls', 'allow', 'tlsHosts', 'tlsCert', 'tlsKey',
    'unlockPrivileged', 'lanPinRef', 'privilegedExtra', 'streamTimeoutMs',
    'mdns', 'mdnsName', 'pwa', 'mobileEnterSends', 'diagnostics',
    'settings', 'randomUuid', 'clipboard',
    'passwordAuth', 'authUser', 'authPassword', 'authPasswordRef', 'authSessionDays',
    'tunnel', 'tunnelTokenRef', 'tunnelPin',
  ]

  for (const expected of expectedKeys) {
    assert.ok(savedKeys.includes(expected), `Поле ${expected} обязано сохраняться при нажатии кнопки Сохранить`)
  }
})
