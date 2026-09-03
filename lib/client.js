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
.lm-card { border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); border-radius:12px; list-style:none; margin-bottom:10px; overflow:hidden }
.lm-head { appearance:none; width:100%; font:inherit; color:inherit; text-align:left; cursor:pointer; background:0 0; border:0; border-radius:12px; display:flex; align-items:center; gap:12px; padding:14px 16px }
.lm-title { color:var(--dsw-alias-label-primary); font-size:15px; font-weight:600; line-height:1.4 }
.lm-sub { color:var(--dsw-alias-label-secondary); font-size:13px; margin-top:2px }
.lm-chev { margin-left:auto; flex:none; color:var(--dsw-alias-label-tertiary); transition:transform .16s }
.lm-chev-open { transform:rotate(180deg) }
.lm-body { border-top:1px solid var(--dsw-alias-border-l2); margin:0 16px; padding:14px 0 16px; display:flex; flex-direction:column; gap:14px }
.lm-row { display:flex; justify-content:space-between; align-items:center; gap:12px; font-size:13px }
.lm-label { color:var(--dsw-alias-label-primary); font-weight:500 }
.lm-hint { color:var(--dsw-alias-label-secondary); font-size:12px; margin-top:2px }
.lm-btn { appearance:none; font:inherit; cursor:pointer; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:6px 12px; font-size:12px; font-weight:500; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); display:inline-flex; align-items:center; gap:6px; text-decoration:none; transition:background .15s }
.lm-btn:hover { background:var(--dsw-alias-bg-layer-1) }
.lm-btn-primary { background:var(--dsw-alias-label-primary); color:var(--dsw-alias-bg-layer-3); border-color:transparent }
.lm-btn-primary:hover { opacity:0.9 }
.lm-qr-box { text-align:center; padding:12px; background:var(--dsw-alias-bg-layer-2); border-radius:10px; border:1px solid var(--dsw-alias-border-l2) }
.lm-qr-img { max-width:200px; height:auto; border-radius:8px; background:#fff; padding:6px }
.lm-badge { display:inline-block; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:600; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary) }
.lm-badge-ok { background:rgba(34,197,94,0.15); color:#22c55e }
.lm-badge-warn { background:rgba(234,179,8,0.15); color:#eab308 }
`

    function ensureStyles() {
      if (document.getElementById('dsh-lanmode-styles')) return
      var style = document.createElement('style')
      style.id = 'dsh-lanmode-styles'
      style.textContent = STYLES
      document.head.appendChild(style)
    }

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
        refreshDevices()
        var iv = setInterval(refreshDevices, 20000)
        return function () { clearInterval(iv) }
      }, [refreshDevices])

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
        refreshTunnel()
        var iv = setInterval(refreshTunnel, 10000)
        return function () { clearInterval(iv) }
      }, [refreshTunnel])

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
              'Для входа по имени: https://dsh.local:3088',
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
              '● dsh.local активен | 📱 Смартфон на связи' + (rtt !== null ? (' | Пинг: ' + rtt + ' мс') : ''),
            ),
          ),
        ),
      )
    }

    module.exports.inject = ['slots', 'locale']

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

      // Регистрация карточки плагина в настройках
      if (ctx.slots && ctx.slots.register) {
        try {
          ctx.slots.register(
            {
              name: 'settings.plugin.item',
              key: NS,
              locale: NS,
              order: 40,
              inject: function () { return { ctx: ctx } },
            },
            LanModeCard,
          )
          ctx.slots.register(
            {
              name: 'sidebar.footer',
              key: NS + '-footer',
              order: 95,
            },
            QuickQrPopover,
          )
        } catch (_) {}
      }

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

      if (ctx.on) {
        ctx.on('turn/end', function () {
          notifyTurnEnd('Агент завершил ответ')
          try { if (navigator && navigator.vibrate) navigator.vibrate([30, 50, 30]) } catch (_) {}
        })
        ctx.on('approval/asked', function (event) {
          var tool = (event && event.toolName) ? ('Инструмент: ' + event.toolName) : 'Требуется подтверждение'
          notifyTurnEnd(tool)
          try { if (navigator && navigator.vibrate) navigator.vibrate([50, 100, 50, 100]) } catch (_) {}
        })
      }

      // #66 Быстрое авто-переподключение при возврате во вкладку
      if (typeof window !== 'undefined') {
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
      }
    }

    return module.exports
  },
})
