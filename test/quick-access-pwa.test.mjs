import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateAsciiQR } from '../lib/qr.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Блок 3: #35 Генерация компактного ASCII QR-кода для терминала', () => {
  const ascii = generateAsciiQR('http://dsh.local:3088')
  assert.ok(typeof ascii === 'string', 'должен возвращать строку')
  assert.ok(ascii.includes('█') || ascii.includes('▀') || ascii.includes('▄'), 'должен содержать символы блоков')
  assert.ok(ascii.split('\n').length > 5, 'должен быть многострочным')
})

test('Блок 3: #33 & #34 Регистрация QuickQrPopover и слота sidebar.footer.action в client.js', () => {
  const client = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')
  assert.ok(client.includes('sidebar.footer.action'), 'должен регистрироваться слот sidebar.footer.action')
  assert.ok(client.includes('QuickQrPopover'), 'должен объявляться компонент QuickQrPopover')
  assert.ok(client.includes('lm-modal-backdrop'), 'должен рендерить модальное окно с QR')
})

test('Блок 3: #36 Индикатор подключенного смартфона на десктопе', () => {
  const client = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')
  assert.ok(client.includes('Смартфон на связи'), 'должен содержать индикатор статуса смартфона')
})

test('Блок 3: #39/74 Расширенный манифест PWA и Splash Screen', () => {
  const indexSource = readFileSync(path.join(here, '..', 'lib', 'index.js'), 'utf8')
  assert.ok(indexSource.includes('apple-touch-icon'), 'должен подключаться apple-touch-icon')
  assert.ok(indexSource.includes('shortcuts'), 'в манифесте должны быть shortcuts')
  assert.ok(indexSource.includes('categories'), 'в манифесте должны быть categories')
  assert.ok(indexSource.includes('orientation'), 'в манифесте должна быть orientation')
})

test('Issue #89: Отложенная регистрация слотов через ctx.slots.inject (settings.plugin.item, sidebar.footer.action)', async () => {
  const vm = await import('node:vm')
  const clientCode = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

  assert.ok(clientCode.includes('registerSlotWhenReady'), 'должен использовать вспомогательную функцию отложенной регистрации')
  assert.ok(clientCode.includes('@goodandready/dsh-lanmode:qr'), 'слот списка sidebar.footer.action должен иметь уникальный id')

  function runClient(mockCtx) {
    let loaded = null
    const mockWindow = {
      __ModuleLoader__: { load: (entry) => { loaded = entry } },
      addEventListener: () => {},
      dispatchEvent: () => {},
    }
    const context = vm.createContext({
      window: mockWindow,
      document: { addEventListener: () => {} },
      navigator: {},
      console,
      setTimeout,
      clearTimeout,
      CustomEvent: class {},
    })
    vm.runInContext(clientCode, context)

    const mockReact = {
      useState: (v) => [v, () => {}],
      useEffect: () => {},
      useCallback: (fn) => fn,
      useMemo: (fn) => fn(),
      createElement: () => ({}),
    }
    const modExports = loaded.factory((mod) => (mod === 'react' ? mockReact : {}))
    modExports.apply(mockCtx)
  }

  // Сценарий 1: DSH UI с поддержкой отложенного монтирования слотов ctx.slots.inject
  const injected = []
  const registered = []
  const mockCtxInject = {
    slots: {
      inject: (name, cb) => {
        injected.push(name)
        cb()
      },
      register: (opts) => {
        registered.push(opts)
      },
    },
    locale: { register: () => {} },
    on: () => {},
  }
  runClient(mockCtxInject)
  assert.deepEqual(injected, ['settings.plugin.item', 'sidebar.footer.action'])
  assert.equal(registered.length, 2)
  assert.equal(registered[0].name, 'settings.plugin.item')
  assert.equal(registered[0].key, 'dsh-lanmode')
  assert.equal(registered[1].name, 'sidebar.footer.action')
  assert.equal(registered[1].id, '@goodandready/dsh-lanmode:qr')

  // Сценарий 2: Fallback режим прямой регистрации (если slots.inject отсутствует)
  const registeredFallback = []
  const mockCtxFallback = {
    slots: {
      register: (opts) => {
        registeredFallback.push(opts)
      },
    },
    locale: { register: () => {} },
    on: () => {},
  }
  runClient(mockCtxFallback)
  assert.equal(registeredFallback.length, 2)
  assert.equal(registeredFallback[0].name, 'settings.plugin.item')
  assert.equal(registeredFallback[1].name, 'sidebar.footer.action')
  assert.equal(registeredFallback[1].id, '@goodandready/dsh-lanmode:qr')
})
