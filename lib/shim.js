(function () {
  // Shim runs first on the page before any bundle loads.
  // Enabled flags are determined by the host and delivered in __DSH_LANMODE__.
  var options = window.__DSH_LANMODE__ || {}

  // Debug query parameters in location bar:
  //   ?lanmode=off    - do not intervene (observe default behavior without plugin)
  //   ?lanmode=invert - pretend external origin on localhost
  //                     (verifies that the shim genuinely controls the flag).
  var mode = ''
  try { mode = new URLSearchParams(location.search).get('lanmode') || '' } catch (noSearch) { mode = '' }
  if (mode === 'off') return
  var loopbackAnswer = mode !== 'invert'

  // #178: remote clients that loaded this shim are the host owner for UI gates.
  try {
    var transport = window.__DSH_TRANSPORT__ || (window.__DSH_TRANSPORT__ = {})
    if (loopbackAnswer) transport.ownsHost = true
  } catch (err) { /* bestEffort */ void err }


  // ------------------------------------------------------- crypto.randomUUID
  //
  // Exists only on secure contexts, but the Web UI calls it on boot:
  // on plain HTTP over LAN addresses, boot fails without this shim.
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
  // Also available only in secure contexts. Without this fallback, 'Copy'
  // buttons silently fail; fall back to execCommand through a hidden textarea.
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
      } catch (cannotDefine) { /* keep as is */ }
    }
  }

  // ------------------------- #57: PWA auto-restore session (iOS Memory Eviction)
  try {
    if (typeof window !== 'undefined' && window.sessionStorage && window.localStorage) {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i)
        if (k && k.indexOf('dsh_') === 0 && !sessionStorage.getItem(k)) {
          sessionStorage.setItem(k, localStorage.getItem(k))
        }
      }
      var origSetItem = sessionStorage.setItem
      sessionStorage.setItem = function (key, val) {
        if (key && key.indexOf('dsh_') === 0) {
          try { localStorage.setItem(key, val) } catch (err) { /* bestEffort */ void err }
        }
        return origSetItem.apply(this, arguments)
      }
    }
  } catch (err) { /* bestEffort */ void err }

  // ------------------------- #55: LAN PIN prompt modal on HTTP 403 & #201, #374, #240
  try {
    if (typeof window !== 'undefined' && window.fetch) {
      try {
        var savedPin = localStorage.getItem('dsh_lan_pin')
        if (savedPin) {
          document.cookie = 'dsh_lan_pin=' + encodeURIComponent(savedPin) + '; path=/; max-age=2592000'
        }
      } catch (err) { /* bestEffort */ void err }

      var _pendingOps = []
      var _pinModalActive = false

      function buildRetryHeaders(resource, init, pin) {
        var base = (init && init.headers) || (resource && typeof resource === 'object' && resource.headers)
        if (!base) {
          return { 'x-dsh-lan-pin': pin }
        }
        if (typeof Headers !== 'undefined' && base instanceof Headers) {
          var h = new Headers(base)
          h.set('x-dsh-lan-pin', pin)
          return h
        }
        if (Array.isArray(base)) {
          if (typeof Headers !== 'undefined') {
            var ha = new Headers(base)
            ha.set('x-dsh-lan-pin', pin)
            return ha
          }
          var pa = {}
          for (var i = 0; i < base.length; i++) pa[base[i][0]] = base[i][1]
          pa['x-dsh-lan-pin'] = pin
          return pa
        }
        if (typeof base === 'object') {
          if (typeof base.forEach === 'function' && typeof base.get === 'function') {
            if (typeof Headers !== 'undefined') {
              var hl = new Headers()
              base.forEach(function (v, k) { hl.set(k, v) })
              hl.set('x-dsh-lan-pin', pin)
              return hl
            }
          }
          var plain = Object.assign({}, base)
          plain['x-dsh-lan-pin'] = pin
          return plain
        }
        return { 'x-dsh-lan-pin': pin }
      }

      var promptPinModal = function () {
        if (_pinModalActive || document.getElementById('dsh-pin-modal')) return
        _pinModalActive = true

        var backdrop = document.createElement('div')
        backdrop.id = 'dsh-pin-modal'
        backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.75));z-index:20000;display:flex;align-items:center;justify-content:center;padding:16px;'
        var card = document.createElement('div')
        card.style.cssText = 'background:var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-3, #1e1e2e));border:1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1, #313244));border-radius:16px;padding:24px;max-width:320px;width:100%;color:var(--dsw-alias-label-primary, #cdd6f4);box-shadow:0 8px 32px rgba(0,0,0,0.6);text-align:center;'
        var t = (window.__DSH_LANMODE_PARTS && window.__DSH_LANMODE_PARTS.translate) || function (k, fb) { return fb || k }; var titleText = t('pinModalTitle') || '🔒 LAN PIN Required'; var descText = t('pinModalDesc') || 'Privileged settings are protected by the host PIN.'; var pinPh = t('pinModalPlaceholder') || 'PIN'; var cancelText = t('pinModalCancel') || 'Cancel'; var unlockText = t('pinModalUnlock') || 'Unlock'
        card.innerHTML = '<div style="font-weight:600;font-size:16px;margin-bottom:8px;color:var(--dsw-alias-label-primary, #cdd6f4);">' + titleText + '</div>'
          + '<div style="font-size:12px;color:var(--dsw-alias-label-secondary, #a6adc8);margin-bottom:16px;">' + descText + '</div>'
          + '<input id="dsh-pin-input" type="password" maxlength="12" placeholder="' + pinPh + '" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2, #45475a);background:var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-1, #181825));color:var(--dsw-alias-label-primary, #fff);font-size:18px;text-align:center;letter-spacing:4px;box-sizing:border-box;margin-bottom:16px;outline:none;" />'
          + '<div style="display:flex;gap:8px;">'
          + '<button id="dsh-pin-cancel" type="button" style="flex:1;padding:8px;border-radius:8px;background:var(--dsw-alias-fill-l1, var(--dsw-alias-bg-layer-3, #313244));color:var(--dsw-alias-label-primary, #cdd6f4);border:1px solid var(--dsw-alias-border-l2, transparent);cursor:pointer;">' + cancelText + '</button>'
          + '<button id="dsh-pin-submit" type="button" style="flex:1;padding:8px;border-radius:8px;background:var(--dsw-alias-brand-primary, #6366f1);color:var(--dsw-alias-label-primary-inverted, #fff);border:none;cursor:pointer;font-weight:600;">' + unlockText + '</button>'
          + '</div>'
        backdrop.appendChild(card)
        document.body.appendChild(backdrop)

        var input = card.querySelector('#dsh-pin-input')
        if (input && typeof input.focus === 'function') input.focus()

        var close = function () {
          _pinModalActive = false
          if (backdrop.parentNode && typeof backdrop.parentNode.removeChild === 'function') {
            backdrop.parentNode.removeChild(backdrop)
          }
        }
        var cancelBtn = card.querySelector('#dsh-pin-cancel')
        if (cancelBtn) {
          cancelBtn.onclick = function () {
            close()
            var ops = _pendingOps.slice()
            _pendingOps = []
            for (var i = 0; i < ops.length; i++) {
              try { ops[i].resolve(ops[i].response) } catch (e) { /* bestEffort */ void e }
            }
          }
        }
        var submitBtn = card.querySelector('#dsh-pin-submit')
        if (submitBtn) {
          submitBtn.onclick = function () {
            var pin = (input && input.value ? input.value : '').trim()
            if (!pin) return
            try {
              localStorage.setItem('dsh_lan_pin', pin)
              document.cookie = 'dsh_lan_pin=' + encodeURIComponent(pin) + '; path=/; max-age=2592000'
            } catch (err) { /* bestEffort */ void err }
            close()
            var ops = _pendingOps.slice()
            _pendingOps = []
            for (var i = 0; i < ops.length; i++) {
              (function (op) {
                try {
                  var retryInit = Object.assign({}, op.init || {})
                  retryInit.headers = buildRetryHeaders(op.retryResource, op.init, pin)
                  origFetch(op.retryResource, retryInit).then(op.resolve, op.reject)
                } catch (err) {
                  op.reject(err)
                }
              })(ops[i])
            }
          }
        }
      }

      var origFetch = window.fetch
      window.fetch = function (resource, init) {
        var retryResource = resource
        if (typeof Request !== 'undefined' && resource instanceof Request && typeof resource.clone === 'function') {
          try { retryResource = resource.clone() } catch (e) { /* bestEffort */ void e }
        }
        return origFetch.apply(this, arguments).then(function (response) {
          if (response.status === 401 && response.headers && response.headers.get('x-dsh-auth-required') === '1') {
            try {
              if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                var evt = typeof CustomEvent === 'function'
                  ? new CustomEvent('dsh:auth-required', { detail: { response: response } })
                  : { type: 'dsh:auth-required', detail: { response: response } }
                window.dispatchEvent(evt)
              }
            } catch (err) { /* bestEffort */ void err }
            return response
          }
          if (response.status === 403 && response.headers && response.headers.get('x-dsh-lan-pin-required') === '1') {
            return new Promise(function (resolve, reject) {
              _pendingOps.push({
                resource: resource,
                retryResource: retryResource,
                init: init,
                response: response,
                resolve: resolve,
                reject: reject,
              })
              promptPinModal()
            })
          }
          return response
        })
      }
    }
  } catch (err) { /* bestEffort */ void err }

  // ------------------------------------------------------------- settings
  if (!options.settings) return

  // The flag lives on the connection object, read in two distinct places.
  //
  // Settings catalog initializes in apply() of the settings package, where
  // context proxying sufficed. However, individual sections bind differently:
  //
  //     bind(spec) {
  //       const ctx = this.ctx                      // caller context
  //       const connection = ctx.get('connection')
  //       ... connection.isLoopback ? 'host' : 'memory'
  //     }
  //
  // this.ctx is the plugin calling bind. Proxying context per-plugin is
  // insufficient because the service retains the original context.
  // We proxy the connection object itself once globally across the interface:
  // core and all plugins share the spoofed flag.
  //
  // Single exception: deliverable file opening. There the flag controls
  // whether files open locally on the client host. For that package, the true
  // loopback status is returned.
  var EXCLUDED = [
    '@deepseek-ai/dsh-client-ui-deliverables',
  ]

  /** True response following core rules: loopback hostnames only. */
  function realLoopback() {
    var host = location.hostname
    if (host === 'localhost' || host === '[::1]' || host === '::1') return true
    return /^127\./.test(host)
  }

  // Install proxy as early as possible: once any package receives
  // a context exposing the connection object.
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
      // Property non-configurable: keep as is, page behaves as without plugin.
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

  /** Context of excluded package: receives genuine loopback value. */
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
        // Excluded package may access connection early; always supply
        // a proxy yielding genuine loopback flag.
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

  // The loader overwrites its own load method when transitioning from
  // queue to active mode. We wrap it via an accessor property so newly
  // assigned loaders are automatically wrapped.
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

    // Wrap modules already enqueued prior to shim execution.
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
    // Non-configurable loader property: preserve original behavior.
  }
})()

  // #177: remember a launch token and let the service worker reopen PWA bookmarks.
  try {
    var params = new URLSearchParams(location.search)
    var launch = params.get('token')
    if (launch) localStorage.setItem('dsh_lanmode_reopen_token', launch)
    if (navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {
      navigator.serviceWorker.register('/dsh-lanmode/sw.js', { scope: '/' }).then(function (reg) {
        var worker = reg.active || navigator.serviceWorker.controller
        var stored = localStorage.getItem('dsh_lanmode_reopen_token')
        if (worker && stored) worker.postMessage({ type: 'dsh-lanmode-token', token: stored })
      }).catch(function () {})
    }
  } catch (err) { /* bestEffort */ void err }
