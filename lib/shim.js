(function () {
  // Заплатка выполняется первой на странице, до загрузки чего бы то ни было.
  // Что включено — решает хост-половина, значения приезжают в __DSH_LANMODE__.
  var options = window.__DSH_LANMODE__ || {}

  // Отладочные переключатели в адресной строке:
  //   ?lanmode=off    — не вмешиваться совсем (посмотреть, как без плагина);
  //   ?lanmode=invert — притвориться чужой страницей на своей же
  //                     (так проверяется, что заплатка правда управляет флагом).
  var mode = ''
  try { mode = new URLSearchParams(location.search).get('lanmode') || '' } catch (noSearch) { mode = '' }
  if (mode === 'off') return
  var loopbackAnswer = mode !== 'invert'

  // ------------------------------------------------------- crypto.randomUUID
  //
  // Приём и заготовка — из dsh-web-lan-access (AcidGr), MIT. Существует только
  // на защищённом соединении, а интерфейс зовёт его при загрузке: на чистом
  // HTTP по сетевому адресу без этого не поднимается вообще ничего.
  if (options.randomUuid) {
    var crypto_ = globalThis.crypto
    if (!crypto_) { try { crypto_ = globalThis.crypto = {} } catch (frozen) { crypto_ = null } }
    if (crypto_ && typeof crypto_.randomUUID !== 'function' && typeof crypto_.getRandomValues === 'function') {
      crypto_.randomUUID = function randomUUID() {
        var bytes = new Uint8Array(16)
        crypto_.getRandomValues(bytes)
        bytes[6] = (bytes[6] & 15) | 64
        bytes[8] = (bytes[8] & 63) | 128
        var hex = ''
        for (var i = 0; i < 16; i++) hex += bytes[i].toString(16).padStart(2, '0')
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16)
          + '-' + hex.slice(16, 20) + '-' + hex.slice(20)
      }
    }
  }

  // ------------------------------------------------------ navigator.clipboard
  //
  // Тоже только для защищённого соединения. Без него кнопки «Копировать»
  // молча ничего не делают; подставляем старый способ через скрытое поле.
  if (options.clipboard) {
    var nav = window.navigator
    if (nav && (!nav.clipboard || typeof nav.clipboard.writeText !== 'function')) {
      var writeText = function (text) {
        return new Promise(function (resolve, reject) {
          try {
            var area = document.createElement('textarea')
            area.value = String(text)
            area.setAttribute('readonly', '')
            area.style.position = 'fixed'
            area.style.opacity = '0'
            document.body.appendChild(area)
            area.select()
            var copied = document.execCommand('copy')
            document.body.removeChild(area)
            copied ? resolve() : reject(new Error('copy rejected'))
          } catch (failure) { reject(failure) }
        })
      }
      try {
        if (nav.clipboard) nav.clipboard.writeText = writeText
        else Object.defineProperty(nav, 'clipboard', { configurable: true, value: { writeText: writeText } })
      } catch (cannotDefine) { /* останется как было */ }
    }
  }

  // ------------------------------------------------------------- настройки
  if (!options.settings) return

  // Флаг читают трое, и третьему подменять нельзя: в результатах работы он
  // решает, можно ли открыть файл локально, и с подменой браузер просил бы
  // открыть путь на машине сервера. Поэтому — только два настроечных пакета.
  var TARGETS = [
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-settings-general',
  ]

  function connectionWithForcedFlag(connection) {
    if (!connection || typeof connection !== 'object') return connection
    return new Proxy(connection, {
      get: function (target, prop) {
        if (prop === 'isLoopback') return loopbackAnswer
        var value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }

  function ctxWithForcedConnection(ctx) {
    return new Proxy(ctx, {
      get: function (target, prop) {
        if (prop === 'get') {
          return function (nameRequested) {
            var value = target.get(nameRequested)
            return nameRequested === 'connection' ? connectionWithForcedFlag(value) : value
          }
        }
        if (prop === 'connection') return connectionWithForcedFlag(Reflect.get(target, prop, target))
        var value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }

  function wrap(registration) {
    if (!registration || TARGETS.indexOf(registration.id) === -1) return registration
    if (typeof registration.factory !== 'function') return registration
    var factory = registration.factory
    var patched = {}
    for (var key in registration) patched[key] = registration[key]
    patched.factory = function (requireFn) {
      var moduleExports = factory(requireFn)
      if (!moduleExports || typeof moduleExports.apply !== 'function') return moduleExports
      var originalApply = moduleExports.apply
      moduleExports.apply = function (ctx) {
        return originalApply.call(this, ctxWithForcedConnection(ctx))
      }
      return moduleExports
    }
    return patched
  }

  // Загрузчик подменяет собственный load, когда переходит из режима очереди в
  // рабочий, — обёртка при этом слетала бы. Поэтому ставим её через
  // свойство-аксессор: любая новая функция оборачивается снова.
  function install(loader) {
    if (!loader || typeof loader !== 'object') return loader
    if (loader.load && loader.load.__dshLanmode) return loader
    var wrapped

    function rewrap(fn) {
      if (typeof fn !== 'function' || fn.__dshLanmode) { wrapped = fn; return }
      var inner = fn
      wrapped = function (registration) { return inner.call(this, wrap(registration)) }
      wrapped.__dshLanmode = true
    }

    rewrap(loader.load)
    try {
      Object.defineProperty(loader, 'load', {
        configurable: true,
        get: function () { return wrapped },
        set: function (fn) { rewrap(fn) },
      })
    } catch (cannotDefine) {
      loader.load = wrapped
    }

    // Уже поставленные в очередь до нас — тоже наши.
    if (Array.isArray(loader.pendingQueue)) {
      for (var i = 0; i < loader.pendingQueue.length; i++) {
        loader.pendingQueue[i] = wrap(loader.pendingQueue[i])
      }
    }
    return loader
  }

  if (window.__ModuleLoader__) {
    install(window.__ModuleLoader__)
    return
  }
  var held
  try {
    Object.defineProperty(window, '__ModuleLoader__', {
      configurable: true,
      get: function () { return held },
      set: function (value) { held = install(value) },
    })
  } catch (cannotDefine) {
    // Свойство неподатливо — молчим: страница останется такой же, какой была
    // без плагина.
  }
})()
