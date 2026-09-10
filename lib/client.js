// dsh-lanmode — клиентская половина.
//
// 1. Карточка в Настройки -> Плагины -> Настройки плагинов (слот settings.plugin.item).
// 2. Фоновые уведомления (Web Notifications API) по завершению генерации turn/end при неактивной вкладке.
// 3. Быстрый просмотр LAN-адресов, QR-кода для мобильных и загрузка Root CA.
// 4. Подсказка для dsh-voice о необходимости HTTPS для микрофона.

window.__ModuleLoader__.load({
  id: '@goodandready/dsh-lanmode',
  factory: function (require) {
    var module = { exports: {} }
    var React = require('react')
    var useState = React.useState
    var useEffect = React.useEffect
    var useCallback = React.useCallback
    var useMemo = React.useMemo

    var NS = 'dsh-lanmode'

    var ChevronIcon = null
    try {
      var primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      ChevronIcon = primitives && primitives.IconChevronDownOutline14
    } catch (_) {
      ChevronIcon = null
    }

    function FallbackChevron(props) {
      return React.createElement(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 14 14',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className: props.className,
          style: props.style,
        },
        React.createElement('path', { d: 'M3.5 5.25L7 8.75L10.5 5.25' }),
      )
    }

    var Chevron = ChevronIcon || FallbackChevron

    var STYLES = `
.lm-card { border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); border-radius:12px; list-style:none; margin-bottom:12px; overflow:hidden }
.lm-head { appearance:none; width:100%; font:inherit; color:inherit; text-align:left; cursor:pointer; background:0 0; border:0; border-radius:12px; display:flex; align-items:center; gap:12px; padding:16px 18px }
.lm-title { color:var(--dsw-alias-label-primary); font-size:15px; font-weight:600; line-height:1.4 }
.lm-sub { color:var(--dsw-alias-label-secondary); font-size:13px; margin-top:2px }
.lm-chev { margin-left:auto; flex:none; color:var(--dsw-alias-label-tertiary); transition:transform .16s }
.lm-chev-open { transform:rotate(180deg) }
.lm-body { border-top:1px solid var(--dsw-alias-border-l2); margin:0 18px; padding:16px 0 20px; display:flex; flex-direction:column; gap:16px }

.lm-section-card { border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-2); border-radius:10px; padding:16px; display:flex; flex-direction:column; gap:12px }
.lm-section-title { font-size:14px; font-weight:600; color:var(--dsw-alias-label-primary); display:flex; align-items:center; justify-content:space-between }
.lm-section-desc { font-size:12px; color:var(--dsw-alias-label-secondary); line-height:1.4; margin-top:-4px }

.lm-form-box { background:var(--dsw-alias-bg-layer-2); border-radius:12px; border:1px solid var(--dsw-alias-border-l2); padding:18px 20px; display:flex; flex-direction:column; gap:14px; margin-top:8px }
.lm-form-title { font-size:15px; font-weight:600; color:var(--dsw-alias-label-primary) }
.lm-form-desc { font-size:13px; color:var(--dsw-alias-label-secondary); line-height:1.4 }
.lm-status-msg { font-size:12px; font-weight:500 }
.lm-status-ok { color:var(--dsw-alias-state-success-primary, #22c55e) }
.lm-status-err { color:var(--dsw-alias-state-error-primary, #ef4444) }

.lm-row { display:flex; justify-content:space-between; align-items:center; gap:12px; font-size:13px }
.lm-label { color:var(--dsw-alias-label-primary); font-weight:500 }
.lm-hint { color:var(--dsw-alias-label-secondary); font-size:12px; margin-top:2px }

.lm-btn { appearance:none; font:inherit; cursor:pointer; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:7px 14px; font-size:13px; font-weight:500; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); display:inline-flex; align-items:center; justify-content:center; gap:6px; text-decoration:none; transition:all .15s ease }
.lm-btn:hover:not(:disabled) { background:var(--dsw-alias-bg-layer-4, var(--dsw-alias-bg-layer-1)); border-color:var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2)) }
.lm-btn-primary { background:var(--dsw-alias-label-primary); color:var(--dsw-alias-bg-layer-3); border-color:transparent }
.lm-btn-primary:hover:not(:disabled) { background:var(--dsw-alias-label-primary) !important; color:var(--dsw-alias-bg-layer-3) !important; opacity:0.88; visibility:visible !important }
.lm-btn-danger { color:var(--dsw-alias-state-error-primary); border-color:rgba(239,68,68,0.3); background:rgba(239,68,68,0.08) }
.lm-btn-danger:hover:not(:disabled) { background:rgba(239,68,68,0.15) !important; border-color:rgba(239,68,68,0.5) }
.lm-btn:disabled { opacity:0.5; cursor:not-allowed }

.lm-badge { font-size:12px; padding:3px 10px; border-radius:999px; border:1px solid var(--dsw-alias-border-l2); display:inline-flex; align-items:center; gap:5px; font-weight:500 }
.lm-badge-ok { border-color:var(--dsw-alias-state-success-primary); color:var(--dsw-alias-state-success-primary); background:rgba(16,185,129,0.08) }
.lm-badge-warn { border-color:var(--dsw-alias-state-warning-primary); color:var(--dsw-alias-state-warning-primary); background:rgba(245,158,11,0.08) }
.lm-badge-bad { border-color:var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); background:rgba(239,68,68,0.08) }

.lm-alert-ok { padding:10px 14px; border-radius:8px; background:rgba(16,185,129,0.1); color:var(--dsw-alias-state-success-primary); font-size:13px }
.lm-alert-bad { padding:10px 14px; border-radius:8px; background:rgba(239,68,68,0.1); color:var(--dsw-alias-state-error-primary); font-size:13px }
.lm-banner-warning { padding:12px 16px; border-radius:8px; background:rgba(245,158,11,0.12); border:1px solid var(--dsw-alias-state-warning-primary); color:var(--dsw-alias-state-warning-primary); font-size:13px; display:flex; align-items:center; gap:10px; font-weight:500 }

.lm-qr-box { text-align:center; padding:14px; background:var(--dsw-alias-bg-layer-2); border-radius:10px; border:1px solid var(--dsw-alias-border-l2) }
.lm-qr-img { max-width:200px; height:auto; border-radius:8px; background:#fff; padding:6px }

.lm-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px }
@media(max-width:600px){ .lm-grid { grid-template-columns:1fr } }
.lm-field { display:flex; flex-direction:column; gap:4px }
.lm-field-full { grid-column:1 / -1 }
.lm-field-label { font-size:12px; font-weight:500; color:var(--dsw-alias-label-primary) }
.lm-input { height:36px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary); border-radius:8px; padding:0 12px; font-size:13px; width:100%; box-sizing:border-box }
.lm-input:focus { outline:none; border-color:var(--dsw-alias-state-brand-primary, var(--dsw-alias-label-primary)) }
.lm-select { height:36px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); border-radius:8px; padding:0 12px; color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; cursor:pointer; width:100%; box-sizing:border-box }
.lm-select:focus { outline:none; border-color:var(--dsw-alias-state-brand-primary, var(--dsw-alias-label-primary)) }
.lm-checkbox-label { display:inline-flex; align-items:center; gap:8px; font-size:13px; color:var(--dsw-alias-label-primary); cursor:pointer }

.lm-section-head { font-size:13px; font-weight:600; color:var(--dsw-alias-label-primary); border-bottom:1px solid var(--dsw-alias-border-l2); padding-bottom:6px; margin-top:10px; margin-bottom:4px; grid-column:1 / -1; display:flex; align-items:center; justify-content:space-between }
.lm-section-desc { font-size:11px; font-weight:400; color:var(--dsw-alias-label-secondary); margin-left:8px }
`

    function ensureStyles() {
      if (document.getElementById('dsh-lanmode-styles')) return
      var style = document.createElement('style')
      style.id = 'dsh-lanmode-styles'
      style.setAttribute('data-dsh-plugin', 'dsh-lanmode')
      style.textContent = STYLES
      document.head.appendChild(style)
    }

    function createErrorBoundary() {
      if (!React || typeof React.Component !== 'function') {
        return function NoopBoundary(props) { return props && props.children || null }
      }
      return class ErrorBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { hasError: false, error: null }
        }
        static getDerivedStateFromError(error) {
          return { hasError: true, error: error }
        }
        componentDidCatch(error, errorInfo) {
          // eslint-disable-next-line no-console
          console.error('[dsh-lanmode] React Error in Settings Card:', error, errorInfo)
        }
        render() {
          if (this.state.hasError) {
            return React.createElement(
              'div',
              {
                className: 'lm-alert-bad',
                style: { margin: '12px 0', padding: '14px', borderRadius: '8px' },
              },
              React.createElement('div', { style: { fontWeight: 600, marginBottom: '6px' } }, '⚠️ LanMode Card Error:'),
              React.createElement('div', { style: { fontSize: '12px', wordBreak: 'break-all' } }, String(this.state.error && this.state.error.message || this.state.error)),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-btn',
                  style: { marginTop: '10px', fontSize: '12px', padding: '4px 10px' },
                  onClick: () => this.setState({ hasError: false, error: null }),
                },
                'Повторить'
              )
            )
          }
          return (this.props && this.props.children) || null
        }
      }
    }
    var ErrorBoundary = createErrorBoundary()


    function LanModeCard(props) {
      ensureStyles()
      var t = props.t || function (k) { return k }
      var ctx = props.ctx

      var _open = useState(false)
      var open = _open[0]
      var setOpen = _open[1]

      var _showQr = useState(false)
      var showQr = _showQr[0]
      var setShowQr = _showQr[1]

      var _notifPerm = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
      var notifPerm = _notifPerm[0]
      var setNotifPerm = _notifPerm[1]

      var _copied = useState(false)
      var copied = _copied[0]
      var setCopied = _copied[1]

      var copyLanUrl = useCallback(function () {
        var url = (typeof window !== 'undefined' && window.location && window.location.href) ? window.location.href : ''
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {
            setCopied(true)
            setTimeout(function () { setCopied(false) }, 2000)
          }).catch(function () {})
        }
      }, [])

      var _forceDesktop = useState(function () {
        try { return sessionStorage.getItem('dsh_force_desktop') === '1' } catch (_) { return false }
      })
      var forceDesktop = _forceDesktop[0]
      var setForceDesktop = _forceDesktop[1]

      var isSecure = typeof window !== 'undefined' && window.isSecureContext === true

      var toggleForceDesktop = useCallback(function () {
        var next = !forceDesktop
        setForceDesktop(next)
        try {
          if (next) sessionStorage.setItem('dsh_force_desktop', '1')
          else sessionStorage.removeItem('dsh_force_desktop')
          window.location.reload()
        } catch (_) {}
      }, [forceDesktop])

      var requestNotify = useCallback(function () {
        if (typeof Notification === 'undefined') return
        Notification.requestPermission().then(function (perm) {
          setNotifPerm(perm)
        })
      }, [])

      var _devices = useState([])
      var devices = _devices[0]
      var setDevices = _devices[1]

      var refreshDevices = useCallback(function () {
        fetch('/dsh-lanmode/devices', { cache: 'no-store' })
          .then(function (r) { return r.json() })
          .then(function (list) { if (Array.isArray(list)) setDevices(list) })
          .catch(function () {})
      }, [])

      useEffect(function () {
        if (!open) return
        refreshDevices()
        var iv = setInterval(refreshDevices, 20000)
        return function () { clearInterval(iv) }
      }, [open, refreshDevices])

      var revokeDevice = useCallback(function (id) {
        fetch('/dsh-lanmode/devices/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: id }),
        }).then(function () { refreshDevices() })
      }, [refreshDevices])

      var killAllDevices = useCallback(function () {
        if (!window.confirm('Отозвать все авторизованные устройства? Все сессии будут сброшены.')) return
        fetch('/dsh-lanmode/devices/kill-all', { method: 'POST' }).then(function () { refreshDevices() })
      }, [refreshDevices])

      var _tunnel = useState({ active: false, publicUrl: null, status: 'stopped' })
      var tunnel = _tunnel[0]
      var setTunnel = _tunnel[1]

      var refreshTunnel = useCallback(function () {
        fetch('/dsh-lanmode/tunnel', { cache: 'no-store' })
          .then(function (r) { return r.json() })
          .then(function (t) { if (t) setTunnel(t) })
          .catch(function () {})
      }, [])

      useEffect(function () {
        if (!open) return
        refreshTunnel()
        var iv = setInterval(refreshTunnel, 10000)
        return function () { clearInterval(iv) }
      }, [open, refreshTunnel])

      var toggleTunnel = useCallback(function () {
        var next = !tunnel.active
        fetch('/dsh-lanmode/tunnel/toggle', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: next }),
        })
          .then(function (r) { return r.json() })
          .then(function (t) { if (t) setTunnel(t) })
          .catch(function () {})
      }, [tunnel.active])

      // Issue #95, #109: Безопасная привязка к settingsScope через ctx.get или свойство
      var scope = useMemo(function () {
        var svc = (ctx && typeof ctx.get === "function" ? ctx.get("settingsScope") : null) || (ctx && ctx.settingsScope)
        return (svc && typeof svc.bind === "function") ? svc.bind({ namespace: NS }) : null
      }, [ctx])

      var _snap = useState(function () {
        return scope && scope.getSnapshot ? scope.getSnapshot() : { status: "loading" }
      })
      var snapshot = _snap[0]
      var setSnapshot = _snap[1]

      useEffect(function () {
        if (!scope || !scope.subscribe) return
        var update = function () {
          setSnapshot(scope.getSnapshot ? scope.getSnapshot() : { status: "ready", value: scope.get ? scope.get() : {} })
        }
        update()
        return scope.subscribe(update)
      }, [scope])

      var snapStatus = (snapshot && snapshot.status) || "loading"
      var storedConfig = (snapshot && snapshot.value) || {}

      var _draft = useState(null)
      var draft = _draft[0]
      var setDraft = _draft[1]

      var _saving = useState(false)
      var saving = _saving[0]
      var setSaving = _saving[1]

      var _saveMsg = useState("")
      var saveMsg = _saveMsg[0]
      var setSaveMsg = _saveMsg[1]

      var _saveErr = useState("")
      var saveErr = _saveErr[0]
      var setSaveErr = _saveErr[1]

      var handleLogout = useCallback(function () {
        if (!window.confirm('Вы действительно хотите выйти из учетной записи DSH?')) return
        fetch('/dsh-lanmode/auth/logout', { method: 'POST' })
          .then(function () { window.location.href = '/' })
          .catch(function () { window.location.href = '/' })
      }, [])

      useEffect(function () {
        if (snapStatus === "ready" && draft === null) {
          setDraft({
            // Основной сетевой режим
            mode: storedConfig.mode || "auto",
            directPort: storedConfig.directPort !== undefined ? String(storedConfig.directPort) : "3088",
            tls: storedConfig.tls || "self-signed",
            tlsHosts: Array.isArray(storedConfig.tlsHosts) ? storedConfig.tlsHosts.join(", ") : "",
            tlsCert: storedConfig.tlsCert || "",
            tlsKey: storedConfig.tlsKey || "",
            allow: Array.isArray(storedConfig.allow) ? storedConfig.allow.join(", ") : "",
            unlockPrivileged: storedConfig.unlockPrivileged !== false,
            lanPinRef: storedConfig.lanPinRef || "",
            privilegedExtra: Array.isArray(storedConfig.privilegedExtra) ? storedConfig.privilegedExtra.join(", ") : "",
            streamTimeoutMs: storedConfig.streamTimeoutMs !== undefined ? String(storedConfig.streamTimeoutMs) : "0",

            // Доступность и имя хоста в LAN
            mdns: storedConfig.mdns !== false,
            mdnsName: storedConfig.mdnsName || "dsh.local",
            pwa: storedConfig.pwa !== false,
            mobileEnterSends: Boolean(storedConfig.mobileEnterSends),
            diagnostics: storedConfig.diagnostics !== false,

            // Полифиллы
            settings: storedConfig.settings !== false,
            randomUuid: storedConfig.randomUuid !== false,
            clipboard: storedConfig.clipboard !== false,

            // Аутентификация
            passwordAuth: Boolean(storedConfig.passwordAuth),
            authUser: storedConfig.authUser !== undefined ? storedConfig.authUser : "admin",
            authPassword: storedConfig.authPassword !== undefined ? storedConfig.authPassword : "",
            authPasswordRef: storedConfig.authPasswordRef || "",
            authSessionDays: storedConfig.authSessionDays !== undefined ? String(storedConfig.authSessionDays) : "30",

            // Cloudflare Tunnel
            tunnel: storedConfig.tunnel || "off",
            tunnelTokenRef: storedConfig.tunnelTokenRef || "",
            tunnelPin: storedConfig.tunnelPin !== false,
          })
        }
      }, [snapStatus, storedConfig, draft])

      var saveSettings = useCallback(function () {
        if (!scope || !draft) return
        setSaving(true)
        setSaveMsg("")
        setSaveErr("")

        var broken = []
        var ops = []

        ops.push(Promise.resolve().then(function () {
          return scope.set("mode", draft.mode)
        }).catch(function (e) { broken.push("mode: " + (e && e.message || e)) }))

        var pNum = parseInt(draft.directPort, 10)
        if (isNaN(pNum) || pNum < 1 || pNum > 65535) {
          broken.push("directPort: порт должен быть от 1 до 65535")
        } else {
          ops.push(Promise.resolve().then(function () {
            return scope.set("directPort", pNum)
          }).catch(function (e) { broken.push("directPort: " + (e && e.message || e)) }))
        }

        ops.push(Promise.resolve().then(function () {
          return scope.set("tls", draft.tls)
        }).catch(function (e) { broken.push("tls: " + (e && e.message || e)) }))

        var allowArr = draft.allow ? draft.allow.split(",").map(function (s) { return s.trim() }).filter(Boolean) : []
        ops.push(Promise.resolve().then(function () {
          return scope.set("allow", allowArr)
        }).catch(function (e) { broken.push("allow: " + (e && e.message || e)) }))

        var tlsHostsArr = draft.tlsHosts ? draft.tlsHosts.split(",").map(function (s) { return s.trim() }).filter(Boolean) : []
        ops.push(Promise.resolve().then(function () {
          return scope.set("tlsHosts", tlsHostsArr)
        }).catch(function (e) { broken.push("tlsHosts: " + (e && e.message || e)) }))

        if (draft.tlsCert !== undefined) {
          ops.push(Promise.resolve().then(function () {
            return scope.set("tlsCert", String(draft.tlsCert).trim())
          }).catch(function (e) { broken.push("tlsCert: " + (e && e.message || e)) }))
        }

        if (draft.tlsKey !== undefined) {
          ops.push(Promise.resolve().then(function () {
            return scope.set("tlsKey", String(draft.tlsKey).trim())
          }).catch(function (e) { broken.push("tlsKey: " + (e && e.message || e)) }))
        }

        ops.push(Promise.resolve().then(function () {
          return scope.set("unlockPrivileged", Boolean(draft.unlockPrivileged))
        }).catch(function (e) { broken.push("unlockPrivileged: " + (e && e.message || e)) }))

        if (draft.lanPinRef !== undefined) {
          ops.push(Promise.resolve().then(function () {
            return scope.set("lanPinRef", String(draft.lanPinRef).trim())
          }).catch(function (e) { broken.push("lanPinRef: " + (e && e.message || e)) }))
        }

        var privArr = draft.privilegedExtra ? draft.privilegedExtra.split(",").map(function (s) { return s.trim() }).filter(Boolean) : []
        ops.push(Promise.resolve().then(function () {
          return scope.set("privilegedExtra", privArr)
        }).catch(function (e) { broken.push("privilegedExtra: " + (e && e.message || e)) }))

        var streamNum = parseInt(draft.streamTimeoutMs, 10)
        ops.push(Promise.resolve().then(function () {
          return scope.set("streamTimeoutMs", isNaN(streamNum) || streamNum < 0 ? 0 : streamNum)
        }).catch(function (e) { broken.push("streamTimeoutMs: " + (e && e.message || e)) }))

        // mDNS, PWA, Enter
        ops.push(Promise.resolve().then(function () {
          return scope.set("mdns", Boolean(draft.mdns))
        }).catch(function (e) { broken.push("mdns: " + (e && e.message || e)) }))

        if (draft.mdnsName) {
          var mName = String(draft.mdnsName).trim().toLowerCase()
          if (!mName.endsWith(".local")) mName += ".local"
          ops.push(Promise.resolve().then(function () {
            return scope.set("mdnsName", mName)
          }).catch(function (e) { broken.push("mdnsName: " + (e && e.message || e)) }))
        }

        ops.push(Promise.resolve().then(function () {
          return scope.set("pwa", Boolean(draft.pwa))
        }).catch(function (e) { broken.push("pwa: " + (e && e.message || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set("mobileEnterSends", Boolean(draft.mobileEnterSends))
        }).catch(function (e) { broken.push("mobileEnterSends: " + (e && e.message || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set("diagnostics", Boolean(draft.diagnostics))
        }).catch(function (e) { broken.push("diagnostics: " + (e && e.message || e)) }))

        // Полифиллы
        ops.push(Promise.resolve().then(function () {
          return scope.set("settings", Boolean(draft.settings))
        }).catch(function (e) { broken.push("settings: " + (e && e.message || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set("randomUuid", Boolean(draft.randomUuid))
        }).catch(function (e) { broken.push("randomUuid: " + (e && e.message || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set("clipboard", Boolean(draft.clipboard))
        }).catch(function (e) { broken.push("clipboard: " + (e && e.message || e)) }))

        // Аутентификация
        ops.push(Promise.resolve().then(function () {
          return scope.set("passwordAuth", Boolean(draft.passwordAuth))
        }).catch(function (e) { broken.push("passwordAuth: " + (e && e.message || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set("authUser", String(draft.authUser || "admin").trim())
        }).catch(function (e) { broken.push("authUser: " + (e && e.message || e)) }))

        if (draft.authPassword !== undefined) {
          ops.push(Promise.resolve().then(function () {
            return scope.set("authPassword", String(draft.authPassword))
          }).catch(function (e) { broken.push("authPassword: " + (e && e.message || e)) }))
        }

        if (draft.authPasswordRef !== undefined) {
          ops.push(Promise.resolve().then(function () {
            return scope.set("authPasswordRef", String(draft.authPasswordRef).trim())
          }).catch(function (e) { broken.push("authPasswordRef: " + (e && e.message || e)) }))
        }

        var sessDays = parseInt(draft.authSessionDays, 10)
        ops.push(Promise.resolve().then(function () {
          return scope.set("authSessionDays", isNaN(sessDays) || sessDays < 1 ? 30 : sessDays)
        }).catch(function (e) { broken.push("authSessionDays: " + (e && e.message || e)) }))

        // Cloudflare Tunnel
        ops.push(Promise.resolve().then(function () {
          return scope.set("tunnel", draft.tunnel)
        }).catch(function (e) { broken.push("tunnel: " + (e && e.message || e)) }))

        if (draft.tunnelTokenRef !== undefined) {
          ops.push(Promise.resolve().then(function () {
            return scope.set("tunnelTokenRef", String(draft.tunnelTokenRef).trim())
          }).catch(function (e) { broken.push("tunnelTokenRef: " + (e && e.message || e)) }))
        }

        ops.push(Promise.resolve().then(function () {
          return scope.set("tunnelPin", Boolean(draft.tunnelPin))
        }).catch(function (e) { broken.push("tunnelPin: " + (e && e.message || e)) }))

        Promise.all(ops).then(function () {
          setSaving(false)
          if (broken.length > 0) {
            setSaveErr("Ошибки при сохранении: " + broken.join("; "))
          } else {
            setSaveMsg("Настройки успешно сохранены ✔")
            setTimeout(function () { setSaveMsg("") }, 3000)
          }
        })
      }, [scope, draft])

      return React.createElement(
        'li',
        { className: 'lm-card' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'lm-head',
            'aria-expanded': open,
            onClick: function () { setOpen(!open) },
          },
          React.createElement(
            'div',
            { style: { flex: 1 } },
            React.createElement('div', { className: 'lm-title' }, t('title') || 'Доступ по сети и мобильный вход (dsh-lanmode)'),
            React.createElement('div', { className: 'lm-sub' }, t('sub') || 'mDNS (dsh.local), полифиллы Web API, TLS для микрофона и PWA'),
          ),
          React.createElement(
            'span',
            { className: 'lm-badge ' + (isSecure ? 'lm-badge-ok' : 'lm-badge-warn') },
            isSecure ? 'HTTPS' : 'HTTP',
          ),
          React.createElement(Chevron, { className: 'lm-chev ' + (open ? 'lm-chev-open' : '') }),
        ),
        open && React.createElement(
          'div',
          { className: 'lm-body' },
          React.createElement(
            'div',
            { className: 'lm-row' },
            React.createElement(
              'div',
              null,
              React.createElement('div', { className: 'lm-label' }, 'Быстрое подключение со смартфона'),
              React.createElement('div', { className: 'lm-hint' }, 'Отсканируйте QR-код камерой телефона для входа в LAN'),
            ),
            React.createElement(
              'div',
              { style: { display: 'flex', gap: '8px' } },
              React.createElement(
                'button',
                { type: 'button', className: 'lm-btn', onClick: copyLanUrl },
                copied ? 'Скопировано!' : 'Скопировать URL',
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-btn lm-btn-primary',
                  onClick: function () { setShowQr(!showQr) },
                },
                showQr ? 'Скрыть QR' : 'Показать QR',
              ),
            ),
          ),
          showQr && React.createElement(
            'div',
            { className: 'lm-qr-box' },
            React.createElement('img', {
              className: 'lm-qr-img',
              src: '/dsh-lanmode/qr?url=' + encodeURIComponent(window.location.href),
              alt: 'LAN QR Code',
            }),
            React.createElement(
              'div',
              { className: 'lm-hint', style: { marginTop: '8px' } },
              'Для входа по имени: https://' + (window.location.hostname.endsWith('.local') ? window.location.hostname : 'dsh.local') + (window.location.port ? (':' + window.location.port) : ''),
            ),
          ),
          React.createElement(
            'div',
            { className: 'lm-row' },
            React.createElement(
              'div',
              null,
              React.createElement('div', { className: 'lm-label' }, 'Фоновые системные уведомления'),
              React.createElement('div', { className: 'lm-hint' }, 'Оповещать о завершении ответа агента, когда вкладка свёрнута'),
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'lm-btn ' + (notifPerm === 'granted' ? 'lm-btn-primary' : ''),
                onClick: requestNotify,
              },
              notifPerm === 'granted' ? 'Включены ✔' : 'Включить уведомления',
            ),
          ),
          React.createElement(
            'div',
            { className: 'lm-row' },
            React.createElement(
              'div',
              null,
              React.createElement('div', { className: 'lm-label' }, 'Локальный корневой сертификат (Root CA)'),
              React.createElement('div', { className: 'lm-hint' }, 'Установите на телефон для зелёного HTTPS без предупреждений браузера'),
            ),
            React.createElement(
              'a',
              { href: '/dsh-lanmode/ca.crt', download: 'dsh-lanmode-root-ca.crt', className: 'lm-btn' },
              'Скачать CA (.crt)',
            ),
          ),
          React.createElement(
            'div',
            { className: 'lm-row' },
            React.createElement(
              'div',
              null,
              React.createElement('div', { className: 'lm-label' }, 'Принудительно десктопный вид'),
              React.createElement('div', { className: 'lm-hint' }, 'Отключает мобильный слой для планшетов и iPad'),
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'lm-btn ' + (forceDesktop ? 'lm-btn-primary' : ''),
                onClick: toggleForceDesktop,
              },
              forceDesktop ? 'Десктопный режим ✔' : 'Включить десктопный',
            ),
          ),
          React.createElement(
            'div',
            { className: 'lm-row' },
            React.createElement(
              'div',
              null,
              React.createElement('div', { className: 'lm-label' }, '🌐 Глобальный доступ (Cloudflare Tunnel)'),
              React.createElement(
                'div',
                { className: 'lm-hint' },
                tunnel.active
                  ? ('Активен: ' + (tunnel.publicUrl || 'подключение...'))
                  : 'Доступ со смартфона через интернет без белого IP и проброса портов',
              ),
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'lm-btn ' + (tunnel.active ? 'lm-btn-primary' : ''),
                onClick: toggleTunnel,
              },
              tunnel.active ? 'Туннель ВКЛ ✔' : 'Запустить WAN',
            ),
          ),
          React.createElement(
            'div',
            { style: { marginTop: '12px', borderTop: '1px solid var(--dsw-alias-border-l1, #313244)', paddingTop: '12px' } },
            React.createElement(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
              React.createElement('div', { className: 'lm-label' }, '📱 Сопряжённые устройства (' + devices.length + ')'),
              devices.length > 0 && React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-btn',
                  style: { color: '#ef4444', borderColor: '#ef4444' },
                  onClick: killAllDevices,
                },
                'Сбросить все',
              ),
            ),
            devices.length === 0
              ? React.createElement('div', { className: 'lm-hint' }, 'Нет активных подключений')
              : devices.map(function (dev) {
                return React.createElement(
                  'div',
                  {
                    key: dev.id,
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      background: 'var(--dsw-alias-bg-layer-2, #181825)',
                      borderRadius: '6px',
                      marginBottom: '4px',
                      fontSize: '12px',
                    },
                  },
                  React.createElement(
                    'div',
                    null,
                    React.createElement('span', { style: { color: dev.online ? '#22c55e' : '#6b7280', marginRight: '6px' } }, '●'),
                    React.createElement('strong', null, dev.name || 'Устройство'),
                    React.createElement('span', { style: { color: 'var(--dsw-alias-label-tertiary)', marginLeft: '6px' } }, dev.ip || ''),
                  ),
                  !dev.revoked && React.createElement(
                    'button',
                    {
                      type: 'button',
                      className: 'lm-btn',
                      style: { padding: '2px 8px', fontSize: '11px', height: 'auto' },
                      onClick: function () { revokeDevice(dev.id) },
                    },
                    'Отозвать',
                  ),
                )
              }),
          ),
          React.createElement(
            'div',
            { className: 'lm-form-box' },
            React.createElement(
              ErrorBoundary,
              null,
            React.createElement('div', { className: 'lm-form-title' }, '⚙ Параметры сетевого режима (Config)'),
            React.createElement('div', { className: 'lm-form-desc' }, 'Управление сетевым интерфейсом, TLS-шифрованием и списками доступа для локальной сети.'),
            !scope
              ? React.createElement('div', { className: 'lm-hint' }, 'Служба настроек ядра не смонтирована (работа по базовым параметрам).')
              : snapStatus === 'loading'
                ? React.createElement('div', { className: 'lm-hint' }, 'Загрузка параметров конфигурации с сервера...')
                : snapStatus === 'unavailable'
                  ? React.createElement('div', { className: 'lm-hint' }, 'Снимок настроек dsh-lanmode пока недоступен на сервере.')
                  : draft && React.createElement(
                      'div',
                      { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
                      React.createElement(
                        'div',
                        { className: 'lm-grid' },

                        // --- СЕКЦИЯ 1: Сетевой шлюз и прямой слушатель ---
                        React.createElement('div', { className: 'lm-section-head' },
                          React.createElement('span', null, '🌐 Сетевой шлюз и прямой слушатель (Direct Gateway)'),
                          React.createElement('span', { className: 'lm-section-desc' }, 'mode, port, stream timeout')
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement('label', { className: 'lm-field-label' }, 'Режим работы (mode)'),
                          React.createElement(
                            'select',
                            {
                              className: 'lm-select',
                              value: draft.mode,
                              onChange: function (e) {
                                var val = e.target.value
                                setDraft(function (d) { return Object.assign({}, d, { mode: val }) })
                              },
                            },
                            React.createElement('option', { value: 'auto' }, 'auto (автоматический — прямой при свободном порте)'),
                            React.createElement('option', { value: 'direct' }, 'direct (прямой выделенный слушатель)'),
                            React.createElement('option', { value: 'proxy' }, 'proxy (только исправление страницы без открытия порта)')
                          )
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement('label', { className: 'lm-field-label' }, 'Сетевой порт прямого моста (directPort)'),
                          React.createElement('input', {
                            type: 'number',
                            className: 'lm-input',
                            value: draft.directPort,
                            placeholder: '3088',
                            onChange: function (e) {
                              var val = e.target.value
                              setDraft(function (d) { return Object.assign({}, d, { directPort: val }) })
                            },
                          })
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement('label', { className: 'lm-field-label' }, 'Таймаут стриминга запросов в мс (streamTimeoutMs)'),
                          React.createElement('input', {
                            type: 'number',
                            className: 'lm-input',
                            value: draft.streamTimeoutMs,
                            placeholder: '0 (без ограничений)',
                            onChange: function (e) {
                              var val = e.target.value
                              setDraft(function (d) { return Object.assign({}, d, { streamTimeoutMs: val }) })
                            },
                          })
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement('label', { className: 'lm-field-label' }, 'Дополнительные привилегированные пути (privilegedExtra)'),
                          React.createElement('input', {
                            type: 'text',
                            className: 'lm-input',
                            value: draft.privilegedExtra,
                            placeholder: '/api/custom1, /api/custom2',
                            onChange: function (e) {
                              var val = e.target.value
                              setDraft(function (d) { return Object.assign({}, d, { privilegedExtra: val }) })
                            },
                          })
                        ),

                        // --- СЕКЦИЯ 2: TLS-шифрование и HTTPS ---
                        React.createElement('div', { className: 'lm-section-head' },
                          React.createElement('span', null, '🔒 Шифрование TLS и HTTPS (Микрофон / Сертификаты)'),
                          React.createElement('span', { className: 'lm-section-desc' }, 'tls, certs, SAN hosts')
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement('label', { className: 'lm-field-label' }, 'Режим TLS (tls)'),
                          React.createElement(
                            'select',
                            {
                              className: 'lm-select',
                              value: draft.tls,
                              onChange: function (e) {
                                var val = e.target.value
                                setDraft(function (d) { return Object.assign({}, d, { tls: val }) })
                              },
                            },
                            React.createElement('option', { value: 'self-signed' }, 'self-signed (авто-выпуск Root CA + сертификат хоста)'),
                            React.createElement('option', { value: 'files' }, 'files (собственные PEM-файлы сертификата и ключа)'),
                            React.createElement('option', { value: 'off' }, 'off (отключено / открытый HTTP без микрофона)')
                          )
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement('label', { className: 'lm-field-label' }, 'Дополнительные имена и IP для сертификата (tlsHosts)'),
                          React.createElement('input', {
                            type: 'text',
                            className: 'lm-input',
                            value: draft.tlsHosts,
                            placeholder: 'my-server.local, 192.168.1.50',
                            onChange: function (e) {
                              var val = e.target.value
                              setDraft(function (d) { return Object.assign({}, d, { tlsHosts: val }) })
                            },
                          })
                        ),
                        draft.tls === 'files' && React.createElement(
                          React.Fragment,
                          null,
                          React.createElement(
                            'div',
                            { className: 'lm-field' },
                            React.createElement('label', { className: 'lm-field-label' }, 'Путь к PEM-сертификату (tlsCert)'),
                            React.createElement('input', {
                              type: 'text',
                              className: 'lm-input',
                              value: draft.tlsCert,
                              placeholder: '/path/to/cert.pem',
                              onChange: function (e) {
                                var val = e.target.value
                                setDraft(function (d) { return Object.assign({}, d, { tlsCert: val }) })
                              },
                            })
                          ),
                          React.createElement(
                            'div',
                            { className: 'lm-field' },
                            React.createElement('label', { className: 'lm-field-label' }, 'Путь к приватному ключу (tlsKey)'),
                            React.createElement('input', {
                              type: 'password',
                              className: 'lm-input',
                              value: draft.tlsKey,
                              placeholder: '/path/to/key.pem',
                              onChange: function (e) {
                                var val = e.target.value
                                setDraft(function (d) { return Object.assign({}, d, { tlsKey: val }) })
                              },
                            })
                          )
                        ),

                        // --- СЕКЦИЯ 3: Доступ и безопасность локальной сети ---
                        React.createElement('div', { className: 'lm-section-head' },
                          React.createElement('span', null, '🛡 Контроль доступа в LAN и PIN-защита'),
                          React.createElement('span', { className: 'lm-section-desc' }, 'allow, lanPinRef, privileged calls')
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement('label', { className: 'lm-field-label' }, 'Ссылка на LAN PIN (lanPinRef)'),
                          React.createElement('input', {
                            type: 'text',
                            className: 'lm-input',
                            value: draft.lanPinRef,
                            placeholder: 'DSH_LAN_PIN или имя секрета в credentials',
                            onChange: function (e) {
                              var val = e.target.value
                              setDraft(function (d) { return Object.assign({}, d, { lanPinRef: val }) })
                            },
                          })
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement('label', { className: 'lm-field-label' }, 'Разрешенные IP-адреса и подсети (allow)'),
                          React.createElement('input', {
                            type: 'text',
                            className: 'lm-input',
                            value: draft.allow,
                            placeholder: '192.168.1.0/24, 127.0.0.1 (пусто = все)',
                            onChange: function (e) {
                              var val = e.target.value
                              setDraft(function (d) { return Object.assign({}, d, { allow: val }) })
                            },
                          })
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field lm-field-full' },
                          React.createElement(
                            'label',
                            { className: 'lm-checkbox-label' },
                            React.createElement('input', {
                              type: 'checkbox',
                              checked: Boolean(draft.unlockPrivileged),
                              onChange: function (e) {
                                var val = e.target.checked
                                setDraft(function (d) { return Object.assign({}, d, { unlockPrivileged: val }) })
                              },
                            }),
                            React.createElement('span', null, 'Разрешать привилегированные вызовы (настройки, ключи) с LAN')
                          )
                        ),

                        // --- СЕКЦИЯ 4: Локальное сетевое имя (mDNS) и PWA ---
                        React.createElement('div', { className: 'lm-section-head' },
                          React.createElement('span', null, '📱 Мобильный интерфейс, mDNS и PWA'),
                          React.createElement('span', { className: 'lm-section-desc' }, 'mdns, pwa, mobileEnterSends')
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement('label', { className: 'lm-field-label' }, 'Доменное имя mDNS (mdnsName)'),
                          React.createElement('input', {
                            type: 'text',
                            className: 'lm-input',
                            value: draft.mdnsName,
                            placeholder: 'dsh.local (обязан оканчиваться на .local)',
                            onChange: function (e) {
                              var val = e.target.value
                              setDraft(function (d) { return Object.assign({}, d, { mdnsName: val }) })
                            },
                          })
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field', style: { justifyContent: 'center' } },
                          React.createElement(
                            'label',
                            { className: 'lm-checkbox-label' },
                            React.createElement('input', {
                              type: 'checkbox',
                              checked: Boolean(draft.mdns),
                              onChange: function (e) {
                                var val = e.target.checked
                                setDraft(function (d) { return Object.assign({}, d, { mdnsName: d.mdnsName, mdns: val }) })
                              },
                            }),
                            React.createElement('span', null, 'Анонсировать домен через mDNS (Zeroconf / Bonjour)')
                          )
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement(
                            'label',
                            { className: 'lm-checkbox-label' },
                            React.createElement('input', {
                              type: 'checkbox',
                              checked: Boolean(draft.pwa),
                              onChange: function (e) {
                                var val = e.target.checked
                                setDraft(function (d) { return Object.assign({}, d, { pwa: val }) })
                              },
                            }),
                            React.createElement('span', null, 'PWA Manifest и мобильный viewport meta')
                          )
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement(
                            'label',
                            { className: 'lm-checkbox-label' },
                            React.createElement('input', {
                              type: 'checkbox',
                              checked: Boolean(draft.mobileEnterSends),
                              onChange: function (e) {
                                var val = e.target.checked
                                setDraft(function (d) { return Object.assign({}, d, { mobileEnterSends: val }) })
                              },
                            }),
                            React.createElement('span', null, 'Enter отправляет сообщение на тач-клавиатурах')
                          )
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field lm-field-full' },
                          React.createElement(
                            'label',
                            { className: 'lm-checkbox-label' },
                            React.createElement('input', {
                              type: 'checkbox',
                              checked: Boolean(draft.diagnostics),
                              onChange: function (e) {
                                var val = e.target.checked
                                setDraft(function (d) { return Object.assign({}, d, { diagnostics: val }) })
                              },
                            }),
                            React.createElement('span', null, 'Включить диагностические эндпоинты (/dsh-lanmode/health, /probe, /manifest.json, /qr)')
                          )
                        ),

                        // --- СЕКЦИЯ 5: Полифиллы Web API браузера ---
                        React.createElement('div', { className: 'lm-section-head' },
                          React.createElement('span', null, '🧩 Полифиллы браузера (HTTP Shims)'),
                          React.createElement('span', { className: 'lm-section-desc' }, 'settings, randomUuid, clipboard')
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement(
                            'label',
                            { className: 'lm-checkbox-label' },
                            React.createElement('input', {
                              type: 'checkbox',
                              checked: Boolean(draft.settings),
                              onChange: function (e) {
                                var val = e.target.checked
                                setDraft(function (d) { return Object.assign({}, d, { settings: val }) })
                              },
                            }),
                            React.createElement('span', null, 'Снятие loopback-блокировки настроек')
                          )
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement(
                            'label',
                            { className: 'lm-checkbox-label' },
                            React.createElement('input', {
                              type: 'checkbox',
                              checked: Boolean(draft.randomUuid),
                              onChange: function (e) {
                                var val = e.target.checked
                                setDraft(function (d) { return Object.assign({}, d, { randomUuid: val }) })
                              },
                            }),
                            React.createElement('span', null, 'Полифилл crypto.randomUUID на HTTP')
                          )
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field lm-field-full' },
                          React.createElement(
                            'label',
                            { className: 'lm-checkbox-label' },
                            React.createElement('input', {
                              type: 'checkbox',
                              checked: Boolean(draft.clipboard),
                              onChange: function (e) {
                                var val = e.target.checked
                                setDraft(function (d) { return Object.assign({}, d, { clipboard: val }) })
                              },
                            }),
                            React.createElement('span', null, 'Полифилл navigator.clipboard.writeText на HTTP')
                          )
                        ),

                        // --- СЕКЦИЯ 6: Аутентификация по логину и паролю ---
                        React.createElement('div', { className: 'lm-section-head' },
                          React.createElement('span', null, '🔐 Аутентификация и защита входа'),
                          React.createElement('span', { className: 'lm-section-desc' }, 'passwordAuth, authUser, authPasswordRef')
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field lm-field-full' },
                          React.createElement(
                            'label',
                            { className: 'lm-checkbox-label', style: { fontWeight: 600 } },
                            React.createElement('input', {
                              type: 'checkbox',
                              checked: Boolean(draft.passwordAuth),
                              onChange: function (e) {
                                var val = e.target.checked
                                setDraft(function (d) { return Object.assign({}, d, { passwordAuth: val }) })
                              },
                            }),
                            React.createElement('span', null, '🛡 Включить вход по логину и паролю (блокирует неавторизованный доступ)')
                          )
                        ),
                        Boolean(draft.passwordAuth) && React.createElement(
                          React.Fragment,
                          null,
                          React.createElement(
                            'div',
                            { className: 'lm-field' },
                            React.createElement('label', { className: 'lm-field-label' }, 'Логин администратора (authUser)'),
                            React.createElement('input', {
                              type: 'text',
                              className: 'lm-input',
                              value: draft.authUser,
                              placeholder: 'admin',
                              onChange: function (e) {
                                var val = e.target.value
                                setDraft(function (d) { return Object.assign({}, d, { authUser: val }) })
                              },
                            })
                          ),
                          React.createElement(
                            'div',
                            { className: 'lm-field' },
                            React.createElement('label', { className: 'lm-field-label' }, 'Срок сессии в днях (authSessionDays)'),
                            React.createElement('input', {
                              type: 'number',
                              className: 'lm-input',
                              value: draft.authSessionDays,
                              placeholder: '30',
                              onChange: function (e) {
                                var val = e.target.value
                                setDraft(function (d) { return Object.assign({}, d, { authSessionDays: val }) })
                              },
                            })
                          ),
                          React.createElement(
                            'div',
                            { className: 'lm-field' },
                            React.createElement('label', { className: 'lm-field-label' }, 'Пароль (authPassword)'),
                            React.createElement('input', {
                              type: 'password',
                              className: 'lm-input',
                              value: draft.authPassword,
                              placeholder: 'Пароль для входа',
                              onChange: function (e) {
                                var val = e.target.value
                                setDraft(function (d) { return Object.assign({}, d, { authPassword: val }) })
                              },
                            })
                          ),
                          React.createElement(
                            'div',
                            { className: 'lm-field' },
                            React.createElement('label', { className: 'lm-field-label' }, 'Ссылка на секрет пароля (authPasswordRef)'),
                            React.createElement('input', {
                              type: 'text',
                              className: 'lm-input',
                              value: draft.authPasswordRef,
                              placeholder: 'DSH_AUTH_PASSWORD или имя секрета в credentials',
                              onChange: function (e) {
                                var val = e.target.value
                                setDraft(function (d) { return Object.assign({}, d, { authPasswordRef: val }) })
                              },
                            })
                          )
                        ),

                        // --- СЕКЦИЯ 7: Удаленный доступ (Cloudflare Tunnel) ---
                        React.createElement('div', { className: 'lm-section-head' },
                          React.createElement('span', null, '☁ Удалённый доступ (Cloudflare Tunnel)'),
                          React.createElement('span', { className: 'lm-section-desc' }, 'tunnel, tunnelTokenRef, tunnelPin')
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement('label', { className: 'lm-field-label' }, 'Режим туннеля (tunnel)'),
                          React.createElement(
                            'select',
                            {
                              className: 'lm-select',
                              value: draft.tunnel,
                              onChange: function (e) {
                                var val = e.target.value
                                setDraft(function (d) { return Object.assign({}, d, { tunnel: val }) })
                              },
                            },
                            React.createElement('option', { value: 'off' }, 'off (отключен)'),
                            React.createElement('option', { value: 'quick' }, 'quick (быстрый публичный trycloudflare.com)'),
                            React.createElement('option', { value: 'named' }, 'named (постоянный туннель по токену)')
                          )
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field' },
                          React.createElement('label', { className: 'lm-field-label' }, 'Ссылка на токен туннеля (tunnelTokenRef)'),
                          React.createElement('input', {
                            type: 'text',
                            className: 'lm-input',
                            value: draft.tunnelTokenRef,
                            placeholder: 'CF_TUNNEL_TOKEN или имя секрета',
                            onChange: function (e) {
                              var val = e.target.value
                              setDraft(function (d) { return Object.assign({}, d, { tunnelTokenRef: val }) })
                            },
                          })
                        ),
                        React.createElement(
                          'div',
                          { className: 'lm-field lm-field-full' },
                          React.createElement(
                            'label',
                            { className: 'lm-checkbox-label' },
                            React.createElement('input', {
                              type: 'checkbox',
                              checked: Boolean(draft.tunnelPin),
                              onChange: function (e) {
                                var val = e.target.checked
                                setDraft(function (d) { return Object.assign({}, d, { tunnelPin: val }) })
                              },
                            }),
                            React.createElement('span', null, 'Требовать LAN PIN при входе через Cloudflare WAN туннель')
                          )
                        )
                      ),
                      React.createElement(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '4px' } },
                        React.createElement(
                          'div',
                          { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                          React.createElement(
                            'button',
                            {
                              type: 'button',
                              className: 'lm-btn lm-btn-primary',
                              disabled: saving,
                              onClick: saveSettings,
                            },
                            saving ? 'Сохранение...' : 'Сохранить настройки'
                          ),
                          saveMsg && React.createElement('span', { className: 'lm-status-msg lm-status-ok' }, saveMsg),
                          saveErr && React.createElement('span', { className: 'lm-status-msg lm-status-err' }, saveErr)
                        ),
                        Boolean(storedConfig.passwordAuth || (draft && draft.passwordAuth)) && React.createElement(
                          'button',
                          {
                            type: 'button',
                            className: 'lm-btn lm-btn-danger',
                            title: 'Завершить текущую сессию входа в DSH',
                            onClick: handleLogout,
                          },
                          'Выйти из системы'
                        )
                      )
                    )
              )
          ),
          React.createElement(
            'div',
            { style: { marginTop: '8px', fontSize: '12px' } },
            React.createElement(
              'a',
              {
                href: '/dsh-lanmode/health',
                target: '_blank',
                rel: 'noreferrer',
                style: { color: 'var(--dsw-alias-label-secondary)', textDecoration: 'underline' },
              },
              'Открыть полную страницу диагностики (/dsh-lanmode/health) →',
            ),
          ),
        ),
      )
    }

    function QuickQrPopover(props) {
      var _open = useState(false)
      var open = _open[0]
      var setOpen = _open[1]
      var _copied = useState(false)
      var copied = _copied[0]
      var setCopied = _copied[1]

      var _rtt = useState(null)
      var rtt = _rtt[0]
      var setRtt = _rtt[1]

      useEffect(function () {
        var measure = function () {
          var t0 = performance.now()
          fetch('/dsh-lanmode/health?format=json', { cache: 'no-store' })
            .then(function () { setRtt(Math.round(performance.now() - t0)) })
            .catch(function () {})
        }
        measure()
        var iv = setInterval(measure, 15000)
        return function () { clearInterval(iv) }
      }, [])

      var copyUrl = function () {
        var origin = window.location.origin
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(origin).then(function () {
            setCopied(true)
            setTimeout(function () { setCopied(false) }, 2000)
          })
        }
      }

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'lm-sidebar-btn',
            title: 'Мобильный вход в LAN (QR)',
            'aria-label': 'Мобильный вход в LAN',
            onClick: function () { setOpen(!open) },
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--dsw-alias-label-secondary)',
              cursor: 'pointer',
            },
          },
          React.createElement(
            'svg',
            { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
            React.createElement('rect', { x: 5, y: 2, width: 14, height: 20, rx: 2, ry: 2 }),
            React.createElement('line', { x1: 12, y1: 18, x2: 12.01, y2: 18 }),
          ),
        ),
        open && React.createElement(
          'div',
          {
            className: 'lm-modal-backdrop',
            onClick: function (e) { if (e.target === e.currentTarget) setOpen(false) },
            style: {
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            },
          },
          React.createElement(
            'div',
            {
              className: 'lm-modal-card',
              style: {
                background: 'var(--dsw-alias-bg-layer-3, #1e1e2e)',
                border: '1px solid var(--dsw-alias-border-l2, #313244)',
                borderRadius: '16px',
                padding: '24px',
                maxWidth: '360px',
                width: '100%',
                boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                color: 'var(--dsw-alias-label-primary, #cdd6f4)',
                position: 'relative',
              },
            },
            React.createElement(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
              React.createElement('div', { style: { fontWeight: 600, fontSize: '16px' } }, '📱 Вход со смартфона'),
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: function () { setOpen(false) },
                  style: { background: 'transparent', border: 'none', color: 'var(--dsw-alias-label-tertiary)', cursor: 'pointer', fontSize: '18px' },
                },
                '✕',
              ),
            ),
            React.createElement(
              'div',
              { className: 'lm-qr-box', style: { textAlign: 'center', padding: '12px' } },
              React.createElement('img', {
                className: 'lm-qr-img',
                src: '/dsh-lanmode/qr?url=' + encodeURIComponent(window.location.href),
                alt: 'LAN QR Code',
                style: { maxWidth: '220px', width: '100%', height: 'auto', background: '#fff', borderRadius: '8px', padding: '6px' },
              }),
              React.createElement('div', { style: { marginTop: '10px', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, 'Адрес: ' + window.location.origin),
            ),
            React.createElement(
              'div',
              { style: { display: 'flex', gap: '8px', marginTop: '16px' } },
              React.createElement(
                'button',
                { type: 'button', className: 'lm-btn lm-btn-primary', style: { flex: 1, justifyContent: 'center' }, onClick: copyUrl },
                copied ? 'Скопировано ✔' : 'Скопировать URL',
              ),
              React.createElement(
                'a',
                { href: '/dsh-lanmode/ca.crt', download: 'dsh-lanmode-root-ca.crt', className: 'lm-btn', style: { justifyContent: 'center' } },
                'CA (.crt)',
              ),
            ),
            React.createElement(
              'div',
              { style: { marginTop: '12px', textAlign: 'center', fontSize: '11px', color: '#22c55e' } },
              '● ' + (window.location.hostname.endsWith('.local') ? window.location.hostname : 'mDNS') + ' активен | 📱 Смартфон на связи' + (rtt !== null ? (' | Пинг: ' + rtt + ' мс') : ''),
            ),
          ),
        ),
      )
    }

    module.exports.inject = ['slots', 'locale', 'settingsScope']
    module.exports.apply = function apply(ctx) {
      if (ctx.locale && ctx.locale.register) {
        try {
          ctx.locale.register(NS, {
            ru: {
              title: 'Доступ по сети и мобильный вход (dsh-lanmode)',
              sub: 'mDNS (dsh.local), полифиллы Web API, TLS для микрофона и PWA',
            },
            en: {
              title: 'LAN & Mobile Access (dsh-lanmode)',
              sub: 'mDNS (dsh.local), Web API shims, TLS for microphone and PWA',
            },
          })
        } catch (_) {}
      }

      // Безопасная отложенная регистрация слотов:
      // В DSH UI слоты объявляются иерархически через таблицу children родительских компонентов.
      // Метод ctx.slots.inject слушает объявление слота родителем и регистрирует компонент
      // в момент, когда родительский компонент смонтирован, предотвращая ошибку:
      // "slot ... is not declared (a parent entry's children table must declare it)".
      function registerSlotWhenReady(slotName, registerFn) {
        if (!ctx.slots) return
        if (typeof ctx.slots.inject === 'function') {
          try {
            ctx.slots.inject(slotName, function () {
              try {
                return registerFn()
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('[dsh-lanmode] Ошибка при регистрации слота ' + slotName + ':', err)
              }
            })
            return
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[dsh-lanmode] Не удалось подписаться на слот ' + slotName + ' через slots.inject:', err)
          }
        }
        if (typeof ctx.slots.register === 'function') {
          try {
            registerFn()
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[dsh-lanmode] Не удалось зарегистрировать слот ' + slotName + ':', err)
          }
        }
      }

      registerSlotWhenReady('settings.plugin.item', function () {
        return ctx.slots.register(
          {
            name: 'settings.plugin.item',
            key: NS,
            locale: NS,
            order: 40,
            inject: function () { return { ctx: ctx } },
          },
          LanModeCard,
        )
      })

      registerSlotWhenReady('sidebar.footer.action', function () {
        return ctx.slots.register(
          {
            name: 'sidebar.footer.action',
            id: '@goodandready/dsh-lanmode:qr',
            key: NS + '-footer',
            order: 95,
          },
          QuickQrPopover,
        )
      })

      // Фоновые уведомления о завершении генерации ответа агента
      function notifyTurnEnd(body) {
        if (typeof document === 'undefined' || !document.hidden) return
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

        try {
          var notification = new Notification('DeepSeek Harness', {
            body: body || 'Агент завершил формирование ответа',
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'dsh-lanmode-turn',
          })
          notification.onclick = function () {
            if (typeof window !== 'undefined') window.focus()
            notification.close()
          }
        } catch (_) {}
      }

      // Issue #97: Устранение утечки слушателей через ctx.effect и функции очистки
      function setupClientListeners() {
        var disposers = []

        if (ctx.on) {
          var offTurn = ctx.on('turn/end', function () {
            notifyTurnEnd('Агент завершил ответ')
            try { if (navigator && navigator.vibrate) navigator.vibrate([30, 50, 30]) } catch (_) {}
          })
          if (typeof offTurn === 'function') disposers.push(offTurn)

          var offApproval = ctx.on('approval/asked', function (event) {
            var tool = (event && event.toolName) ? ('Инструмент: ' + event.toolName) : 'Требуется подтверждение'
            notifyTurnEnd(tool)
            try { if (navigator && navigator.vibrate) navigator.vibrate([50, 100, 50, 100]) } catch (_) {}
          })
          if (typeof offApproval === 'function') disposers.push(offApproval)
        }

        // #66 Быстрое авто-переподключение при возврате во вкладку
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          var onVisible = function () {
            if (document.visibilityState === 'visible') {
              try {
                if (ctx.connection && ctx.connection.refresh) ctx.connection.refresh()
              } catch (_) {}
              window.dispatchEvent(new CustomEvent('dsh-lanmode-reconnect'))
            }
          }
          document.addEventListener('visibilitychange', onVisible)
          window.addEventListener('focus', onVisible)
          disposers.push(function () {
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('focus', onVisible)
          })
        }

        return function () {
          for (var i = 0; i < disposers.length; i++) {
            try { disposers[i]() } catch (_) {}
          }
        }
      }

      var cleanupListeners = null
      if (typeof ctx.effect === 'function') {
        ctx.effect(function () {
          return setupClientListeners()
        }, 'dsh-lanmode-client-listeners')
      } else {
        cleanupListeners = setupClientListeners()
      }
      return cleanupListeners
    }

    return module.exports
  },
})
