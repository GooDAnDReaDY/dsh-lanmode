(function () {
  // Заплатка выполняется в самом начале страницы, до загрузки бандлов ядра.
  //
  // Она перехватывает регистрацию двух настроечных пакетов и подсовывает им
  // связь, у которой isLoopback всегда true. Остальные пакеты видят правду:
  // в результатах работы этот же флаг решает, открывать ли файл локально, и
  // подменять его там нельзя.
  var TARGETS = [
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-settings-general',
  ]

  // Отладочные переключатели через адресную строку:
  //   ?lanmode=off — не вмешиваться (проверить, как было без плагина);
  //   ?lanmode=invert — притвориться чужим на своей же странице
  //                     (так проверяется, что заплатка вообще управляет флагом).
  var mode = ''
  try { mode = new URLSearchParams(location.search).get('lanmode') || '' } catch (noSearch) { mode = '' }
  if (mode === 'off') return
  var forced = mode === 'invert' ? false : true

  function connectionWithForcedFlag(connection) {
    if (!connection || typeof connection !== 'object') return connection
    return new Proxy(connection, {
      get: function (target, prop, receiver) {
        if (prop === 'isLoopback') return forced
        var value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }

  function ctxWithForcedConnection(ctx) {
    return new Proxy(ctx, {
      get: function (target, prop, receiver) {
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

  // Загрузчик подменяет собственный load, когда переходит из режима очереди
  // в рабочий, — обёртка при этом слетала бы. Поэтому ставим её через
  // свойство-аксессор: любая новая функция оборачивается снова.
  function install(loader) {
    if (!loader || typeof loader !== 'object') return loader
    var wrapped

    function rewrap(fn) {
      if (typeof fn !== 'function' || fn.__dshLanmode) { wrapped = fn; return }
      var inner = fn
      wrapped = function (registration) { return inner.call(this, wrap(registration)) }
      wrapped.__dshLanmode = true
    }

    if (loader.load && loader.load.__dshLanmode) return loader
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
    try {
      console.info('[dsh-lanmode] настройки будут работать на этой странице'
        + (forced ? '' : ' (перевёрнутый режим: притворяемся чужим)'))
    } catch (noConsole) { /* незачем */ }
    return loader
  }

  // Загрузчик объявляется встроенным скриптом страницы. Если он уже есть —
  // оборачиваем сразу; если нет — дожидаемся присваивания.
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
    // Свойство неподатливо — молчим: без заплатки страница остаётся такой же,
    // какой была без плагина.
  }
})()
