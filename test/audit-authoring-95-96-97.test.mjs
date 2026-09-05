import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { resolveSecret, makeCredentialRef } from "../lib/secret.js"

test("Issue #97: client.js экспортирует inject со службами и оборачивает слушатели в ctx.effect", () => {
  const clientCode = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8")
  let loaded = null
  let windowListeners = []
  let docListeners = []
  const mockWindow = {
    __ModuleLoader__: {
      load: (def) => { loaded = def },
    },
    location: { href: "https://192.168.1.111:3088/", hostname: "192.168.1.111", port: "3088", origin: "https://192.168.1.111:3088" },
    addEventListener: (ev, cb) => { windowListeners.push({ ev, cb }) },
    removeEventListener: (ev, cb) => { windowListeners = windowListeners.filter((l) => !(l.ev === ev && l.cb === cb)) },
    dispatchEvent: () => {},
  }
  const mockDoc = {
    addEventListener: (ev, cb) => { docListeners.push({ ev, cb }) },
    removeEventListener: (ev, cb) => { docListeners = docListeners.filter((l) => !(l.ev === ev && l.cb === cb)) },
    getElementById: () => null,
    head: { appendChild: () => {} },
  }

  const context = vm.createContext({
    window: mockWindow,
    document: mockDoc,
    navigator: {},
    console,
    setTimeout,
    clearTimeout,
    CustomEvent: class {},
  })
  vm.runInContext(clientCode, context)

  const mockReact = {
    useState: (v) => [typeof v === "function" ? v() : v, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    createElement: () => ({}),
  }

  const modExports = loaded.factory((mod) => (mod === "react" ? mockReact : {}))
  assert.ok(Array.isArray(modExports.inject), "inject обязан быть массивом")
  assert.ok(modExports.inject.includes("settingsScope"), "inject обязан содержать settingsScope")
  assert.ok(modExports.inject.includes("slots"), "inject обязан содержать slots")
  assert.ok(modExports.inject.includes("locale"), "inject обязан содержать locale")

  // Проверка работы с ctx.effect
  let effectRegistered = null
  let effectLabel = ""
  let onTurnDisposed = false
  let onApprovalDisposed = false

  const mockCtxWithEffect = {
    locale: { register: () => {} },
    slots: { inject: () => {}, register: () => {} },
    effect: (fn, label) => {
      effectRegistered = fn
      effectLabel = label
    },
    on: (ev) => {
      if (ev === "turn/end") return () => { onTurnDisposed = true }
      if (ev === "approval/asked") return () => { onApprovalDisposed = true }
      return () => {}
    },
  }

  modExports.apply(mockCtxWithEffect)
  assert.equal(effectLabel, "dsh-lanmode-client-listeners")
  assert.ok(typeof effectRegistered === "function", "эффект обязан быть зарегистрирован")

  // Исполнение эффекта и проверка очистки
  const cleanup = effectRegistered()
  assert.ok(typeof cleanup === "function", "эффект обязан вернуть функцию очистки")
  assert.ok(docListeners.some((l) => l.ev === "visibilitychange"))
  assert.ok(windowListeners.some((l) => l.ev === "focus"))

  cleanup()
  assert.equal(onTurnDisposed, true, "turn/end слушатель должен быть отписан")
  assert.equal(onApprovalDisposed, true, "approval/asked слушатель должен быть отписан")
  assert.equal(docListeners.filter((l) => l.ev === "visibilitychange").length, 0, "DOM visibilitychange слушатель должен быть удален")
  assert.equal(windowListeners.filter((l) => l.ev === "focus").length, 0, "DOM focus слушатель должен быть удален")

  // Проверка fallback без ctx.effect
  const mockCtxNoEffect = {
    locale: { register: () => {} },
    slots: { inject: () => {}, register: () => {} },
    on: () => () => {},
  }
  const directCleanup = modExports.apply(mockCtxNoEffect)
  assert.ok(typeof directCleanup === "function", "при отсутствии ctx.effect apply обязан вернуть cleanup функцию")
})

test("Issue #96: Config поддерживает lanPinRef и tunnelTokenRef; resolveSecret разрешает ссылки", async () => {
  const indexSource = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8")
  assert.ok(indexSource.includes("lanPinRef:"), "index.js обязан содержать поле lanPinRef в Config")
  assert.ok(indexSource.includes("tunnelTokenRef:"), "index.js обязан содержать поле tunnelTokenRef в Config")
  assert.ok(indexSource.includes("lanPin:"), "index.js сохраняет lanPin для обратной совместимости")
  assert.ok(indexSource.includes("tunnelToken:"), "index.js сохраняет tunnelToken для обратной совместимости")
  assert.ok(indexSource.includes("resolveSecret"), "index.js использует resolveSecret для разрешения секретов")

  // 1. Fallback на прямое значение, если ref пуст
  const val1 = await resolveSecret({}, "", "default-pin")
  assert.equal(val1, "default-pin")

  // 2. Разрешение через ctx.credentials
  const mockCtx = {
    credentials: {
      resolve: async (refObj) => {
        if (refObj.ref === "MY_LAN_PIN") {
          return { value: "123456" }
        }
        if (refObj.ref === "CF_TOKEN") {
          return { secret: "eyJh..." }
        }
        return null
      },
    },
  }

  const pin = await resolveSecret(mockCtx, "MY_LAN_PIN", "fallback")
  assert.equal(pin, "123456")

  const tok = await resolveSecret(mockCtx, "CF_TOKEN", "fallback")
  assert.equal(tok, "eyJh...")

  // 3. Fallback в переменные окружения, если credentials недоступен
  process.env.TEST_PIN_ENV = "998877"
  const envPin = await resolveSecret({}, "TEST_PIN_ENV", "fallback")
  assert.equal(envPin, "998877")
  delete process.env.TEST_PIN_ENV

  // 4. makeCredentialRef возвращает канонический объект ссылки
  assert.deepEqual(makeCredentialRef("test-ref"), { ref: "test-ref" })
  assert.deepEqual(makeCredentialRef({ ref: "already-ref" }), { ref: "already-ref" })
  assert.equal(makeCredentialRef(""), null)
})

test("Issue #95: LanModeCard привязывается к settingsScope и отображает форму конфигурации", () => {
  const clientCode = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8")
  let loaded = null
  const context = vm.createContext({
    window: {
      __ModuleLoader__: { load: (def) => { loaded = def } },
      location: { href: "https://192.168.1.111:3088/", hostname: "192.168.1.111", port: "3088" },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    document: { addEventListener: () => {}, removeEventListener: () => {}, getElementById: () => null, head: { appendChild: () => {} }, createElement: () => ({ setAttribute: () => {} }) },
    navigator: {},
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    fetch: () => Promise.resolve({ json: () => Promise.resolve([]) }),
  })
  vm.runInContext(clientCode, context)

  // Моделируем mock React с поддержкой рендера компонентов
  const stateStore = new Map()
  let stateIndex = 0
  const mockReact = {
    useState: (initial) => {
      const idx = stateIndex++
      if (!stateStore.has(idx)) {
        stateStore.set(idx, typeof initial === "function" ? initial() : initial)
      }
      const val = stateStore.get(idx)
      const setter = (next) => {
        const newVal = typeof next === "function" ? next(stateStore.get(idx)) : next
        stateStore.set(idx, newVal)
      }
      return [val, setter]
    },
    useEffect: (fn) => fn(),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  }

  const modExports = loaded.factory((mod) => (mod === "react" ? mockReact : {}))

  let registeredComponent = null
  const mockCtx = {
    locale: { register: () => {} },
    slots: {
      inject: (name, cb) => cb(),
      register: (opts, comp) => {
        if (opts.name === "settings.plugin.item") {
          registeredComponent = comp
        }
      },
    },
    settingsScope: {
      bind: ({ namespace }) => {
        assert.equal(namespace, "dsh-lanmode")
        return {
          getSnapshot: () => ({
            status: "ready",
            value: {
              mode: "direct",
              directPort: 3088,
              tls: "self-signed",
              allow: ["192.168.1.0/24"],
              unlockPrivileged: true,
              lanPinRef: "MY_PIN_REF",
            },
          }),
          subscribe: () => () => {},
          set: async (k, v) => { setCalls.push({ k, v }) },
        }
      },
    },
  }

  const setCalls = []
  modExports.apply(mockCtx)
  assert.ok(registeredComponent, "LanModeCard обязан быть зарегистрирован в слоте")

  // Рендерим компонент в свёрнутом виде
  stateIndex = 0
  stateStore.clear()
  stateStore.set(0, false) // open = false
  const collapsedTree = registeredComponent({ ctx: mockCtx, t: (k) => k })
  assert.equal(collapsedTree.type, "li")

  // Рендерим компонент в раскрытом виде (open = true)
  stateIndex = 0
  stateStore.clear()
  stateStore.set(0, true) // open = true
  const expandedTree = registeredComponent({ ctx: mockCtx, t: (k) => k })
  assert.equal(expandedTree.type, "li")

  // Проверяем наличие формы настроек в дочерних узлах
  const body = expandedTree.children.find((c) => c && c.props && c.props.className === "lm-body")
  assert.ok(body, "lm-body обязан рендериться при open = true")

  const formBox = body.children.find((c) => c && c.props && c.props.className === "lm-form-box")
  assert.ok(formBox, "lm-form-box обязан присутствовать в теле карточки")

  // Проверяем обработку статусов loading и unavailable
  const loadingCtx = {
    settingsScope: {
      bind: () => ({
        getSnapshot: () => ({ status: "loading" }),
        subscribe: () => () => {},
      }),
    },
  }
  stateIndex = 0
  stateStore.clear()
  stateStore.set(0, true)
  const loadingTree = registeredComponent({ ctx: loadingCtx })
  const loadingBody = loadingTree.children.find((c) => c && c.props && c.props.className === "lm-body")
  const loadingBox = loadingBody.children.find((c) => c && c.props && c.props.className === "lm-form-box")
  assert.ok(loadingBox, "lm-form-box корректно рендерится в состоянии loading")

  const unavailCtx = {
    settingsScope: {
      bind: () => ({
        getSnapshot: () => ({ status: "unavailable" }),
        subscribe: () => () => {},
      }),
    },
  }
  stateIndex = 0
  stateStore.clear()
  stateStore.set(0, true)
  const unavailTree = registeredComponent({ ctx: unavailCtx })
  const unavailBody = unavailTree.children.find((c) => c && c.props && c.props.className === "lm-body")
  const unavailBox = unavailBody.children.find((c) => c && c.props && c.props.className === "lm-form-box")
  assert.ok(unavailBox, "lm-form-box корректно рендерится в состоянии unavailable")
})
