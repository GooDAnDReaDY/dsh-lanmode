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
  // Существует только на защищённом соединении, а интерфейс зовёт его при
  // загрузке: на чистом HTTP по сетевому адресу без этого не поднимается
  // вообще ничего.
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

  // Флаг живёт на объекте соединения, и читают его в двух совершенно разных
  // местах.
  //
  // Общий справочник разделов заводится в apply настроечного пакета — там
  // хватало подмены контекста. Но каждый отдельный раздел привязывается иначе:
  //
  //     bind(spec) {
  //       const ctx = this.ctx                      // контекст вызывающего
  //       const connection = ctx.get('connection')
  //       ... connection.isLoopback ? 'host' : 'memory'
  //     }
  //
  // this.ctx — контекст того плагина, который зовёт bind. Подменять контекст
  // каждому плагину бесполезно: сервис запоминает не заместителя, а исходный
  // контекст, через который его завели. Поэтому подменяется не контекст, а сам
  // объект соединения, и ровно один раз: он один на весь интерфейс, и после
  // подмены одинаковый ответ видят все — и ядро, и любой плагин со своим
  // разделом настроек.
  //
  // Исключение одно: выдача результатов работы. Там флаг решает, можно ли
  // открыть файл локально, и с подменой браузер просил бы открыть путь на
  // машине сервера. Этому пакету возвращается настоящее значение. Больше флаг
  // во всём интерфейсе не читает никто.
  var EXCLUDED = [
    '@deepseek-ai/dsh-client-ui-deliverables',
  ]

  /** Настоящий ответ по тому же правилу, что и у ядра: только свои адреса. */
  function realLoopback() {
    var host = location.hostname
    if (host === 'localhost' || host === '[::1]' || host === '::1') return true
    return /^127\./.test(host)
  }

  // Подмена ставится при первой же возможности: как только у кого-то из
  // пакетов появился контекст, из которого достаётся соединение.
  var forced = false

  function forceOnConnection(ctx) {
    if (forced) return
    var connection = null
    try { connection = ctx && ctx.get && ctx.get('connection') } catch (noService) { connection = null }
    if (!connection || typeof connection !== 'object') return
    try {
      Object.defineProperty(connection, 'isLoopback', {
        configurable: true,
        get: function () { return loopbackAnswer },
      })
      forced = true
    } catch (cannotDefine) {
      // Свойство неподатливо — оставляем как было: страница будет вести себя
      // так же, как без плагина.
    }
  }

  function connectionWithRealFlag(connection) {
    if (!connection || typeof connection !== 'object') return connection
    return new Proxy(connection, {
      get: function (target, prop) {
        if (prop === 'isLoopback') return realLoopback()
        var value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }

  /** Контекст исключённого пакета: ему возвращается настоящее значение. */
  function ctxWithRealConnection(ctx) {
    return new Proxy(ctx, {
      get: function (target, prop) {
        if (prop === 'get') {
          return function (nameRequested) {
            var value = target.get(nameRequested)
            return nameRequested === 'connection' ? connectionWithRealFlag(value) : value
          }
        }
        if (prop === 'connection') return connectionWithRealFlag(Reflect.get(target, prop, target))
        var value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }

  function wrap(registration) {
    if (!registration || typeof registration.factory !== 'function') return registration
    var excluded = EXCLUDED.indexOf(registration.id) !== -1
    var factory = registration.factory
    var patched = {}
    for (var key in registration) patched[key] = registration[key]
    patched.factory = function (requireFn) {
      var moduleExports = factory(requireFn)
      if (!moduleExports || typeof moduleExports.apply !== 'function') return moduleExports
      var originalApply = moduleExports.apply
      function prepareArgs(args) {
        // Исключённый пакет читает соединение раньше, чем его успели подменить,
        // — но полагаться на это нельзя, поэтому ему всегда отдаётся
        // заместитель с настоящим значением.
        if (excluded) return [ctxWithRealConnection(args[0])].concat(args.slice(1))
        forceOnConnection(args[0])
        return args
      }
      // Cordis distinguishes constructors, generators and async callbacks.
      // A plain function wrapper would turn async apply into a constructor:
      // its Promise is then not awaited and dependent services boot too early.
      // Proxy preserves the original kind/prototype and forwards the complete
      // call, including configuration, return/disposal values and failures.
      moduleExports.apply = new Proxy(originalApply, {
        apply: function (target, thisArg, args) {
          return Reflect.apply(target, thisArg, prepareArgs(args))
        },
        construct: function (target, args, newTarget) {
          return Reflect.construct(target, prepareArgs(args), newTarget)
        },
      })
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
