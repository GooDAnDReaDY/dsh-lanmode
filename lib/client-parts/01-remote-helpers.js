// Remote-session helpers shared with the injected client.
// Zero hardcoded Cyrillic characters.

;(function (parts) {
  parts.welcomeVersion = function welcomeVersion(doc) {
    if (!doc || typeof doc !== 'object') return null
    var bag = doc.value && typeof doc.value === 'object' ? doc.value : doc
    var block = bag['ui-onboarding'] || bag.uiOnboarding
    if (!block || typeof block !== 'object') return null
    var version = block.welcomeNoticeVersion
    if (version == null || version === '') return null
    return version
  }

  parts.settingsView = function settingsView(doc) {
    if (!doc || typeof doc !== 'object') return null
    if (doc.view) return doc.view
    var bag = doc.value && typeof doc.value === 'object' ? doc.value : doc
    if (bag.view) return bag.view
    if (bag.schema || bag.document || bag.config) {
      return { schema: bag.schema, document: bag.document || bag.config, source: 'dsh-lanmode-mirror' }
    }
    return null
  }
  parts.localePreference = function localePreference(event) {
    if (typeof event === 'string') return event.trim() || null
    if (!event || typeof event !== 'object') return null
    var value = event.preference || event.locale || event.value
    if (typeof value !== 'string') return null
    var clean = value.trim()
    return clean || null
  }

  parts.extractOpenPath = function extractOpenPath(payload) {
    if (!payload || typeof payload !== 'object') return ''
    if (typeof payload.path === 'string' && payload.path) return payload.path
    var args = payload.args
    if (!args || typeof args !== 'object') return ''
    if (typeof args.path === 'string' && args.path) return args.path
    var keys = Object.keys(args)
    for (var i = 0; i < keys.length; i++) {
      var value = args[keys[i]]
      if (value && typeof value === 'object' && typeof value.path === 'string' && value.path) return value.path
    }
    return ''
  }


  parts.installReauthOverlay = function installReauthOverlay(env) {
    var win = (env && env.win) || (typeof window !== 'undefined' ? window : null)
    if (!win || win.__dshLanmodeReauth || typeof win.fetch !== 'function') return
    win.__dshLanmodeReauth = true
    var doc = (env && env.doc) || win.document
    var translate = (env && env.translate) || function (key) { return key }
    var nativeFetch = win.fetch.bind(win)

    function showOverlay() {
      if (!doc || !doc.body || !doc.getElementById || doc.getElementById('dsh-lanmode-reauth')) return
      var root = doc.createElement('div')
      root.id = 'dsh-lanmode-reauth'
      root.setAttribute('role', 'dialog')
      root.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)'
      var form = doc.createElement('form')
      var title = doc.createElement('div')
      title.textContent = translate('reauthTitle')
      var hint = doc.createElement('div')
      hint.textContent = translate('reauthHint')
      var user = doc.createElement('input')
      user.name = 'username'
      user.autocomplete = 'username'
      user.setAttribute('placeholder', translate('reauthUser'))
      var pass = doc.createElement('input')
      pass.name = 'password'
      pass.type = 'password'
      pass.autocomplete = 'current-password'
      pass.setAttribute('placeholder', translate('reauthPassword'))
      var error = doc.createElement('div')
      var button = doc.createElement('button')
      button.type = 'submit'
      button.textContent = translate('reauthSubmit')
      form.appendChild(title)
      form.appendChild(hint)
      form.appendChild(user)
      form.appendChild(pass)
      form.appendChild(error)
      form.appendChild(button)
      form.addEventListener('submit', function (event) {
        event.preventDefault()
        nativeFetch('/dsh-lanmode/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: user.value, password: pass.value, remember: true }),
        }).then(function (res) {
          if (res.ok && root.parentNode) root.parentNode.removeChild(root)
          else error.textContent = translate('reauthFailed')
        }).catch(function () {
          error.textContent = translate('reauthFailed')
        })
      })
      root.appendChild(form)
      doc.body.appendChild(root)
    }

    win.fetch = function () {
      return nativeFetch.apply(win, arguments).then(function (res) {
        var header = res.headers && res.headers.get && res.headers.get('x-dsh-auth-required')
        if (res.status === 401 && header === '1') showOverlay()
        return res
      })
    }
  }


  var DOWNLOAD_EXT = { zip: 1, exe: 1, dmg: 1, pkg: 1, msi: 1, '7z': 1, rar: 1, gz: 1, bz2: 1, iso: 1, bin: 1, apk: 1 }

  parts.shouldDownloadFile = function shouldDownloadFile(filePath) {
    var name = String(filePath || '').split(/[\\/]/).pop() || ''
    var dot = name.lastIndexOf('.')
    if (dot < 0) return false
    return Boolean(DOWNLOAD_EXT[name.slice(dot + 1).toLowerCase()])
  }

  parts.installBinaryDownload = function installBinaryDownload(doc) {
    var root = doc || (typeof document !== 'undefined' ? document : null)
    if (!root || root.__dshLanmodeDownload || !root.addEventListener) return
    root.__dshLanmodeDownload = true
    root.addEventListener('click', function (event) {
      var node = event.target
      if (!node || !node.closest) return
      var link = node.closest('a[href]')
      if (!link) return
      var href = link.getAttribute('href') || ''
      var filePath = href
      try {
        var url = new URL(href, 'http://dsh.local')
        filePath = url.searchParams.get('path') || url.pathname
      } catch (err) { /* keep the raw href */ void err }
      if (!parts.shouldDownloadFile(filePath)) return
      link.setAttribute('download', '')
    }, true)
  }


  parts.installRemoteFileOpen = function installRemoteFileOpen(win) {
    var target = win || (typeof window !== 'undefined' ? window : null)
    if (!target || target.__dshLanmodeFileOpen || typeof target.fetch !== 'function') return
    target.__dshLanmodeFileOpen = true
    var nativeFetch = target.fetch.bind(target)
    target.fetch = function (input, init) {
      var raw = typeof input === 'string' ? input : (input && input.url) || ''
      var filePath = ''
      try {
        var url = new URL(raw, 'http://dsh.local')
        var pathName = url.pathname || ''
        if (/\/auth\/file$/.test(pathName) || /\/file$/.test(pathName)) {
          filePath = url.searchParams.get('path') || ''
        }
      } catch (err) { /* not a file URL */ void err }
      if (!filePath || !parts.shouldDownloadFile(filePath)) return nativeFetch(input, init)
      var doc = target.document
      if (doc && doc.createElement && doc.body) {
        var link = doc.createElement('a')
        link.href = raw
        link.setAttribute('download', '')
        link.rel = 'noopener'
        doc.body.appendChild(link)
        if (typeof link.click === 'function') link.click()
        if (link.parentNode) link.parentNode.removeChild(link)
      }
      var ResponseCtor = target.Response
      if (typeof ResponseCtor === 'function') {
        return Promise.resolve(new ResponseCtor(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }))
      }
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }) } })
    }
  }

})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {})
