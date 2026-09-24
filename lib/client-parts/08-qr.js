;(function (parts) {
  parts.installQr = function (env) {
    var useState = env.useState, useEffect = env.useEffect, getNow = env.getNow, translate = env.translate
    var useMemo = env.useMemo, React = env.React
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
      var _rttError = useState('')
      var rttError = _rttError[0]
      var setRttError = _rttError[1]

      var _interfaces = useState([])
      var interfaces = _interfaces[0]
      var setInterfaces = _interfaces[1]

      var _selectedHost = useState('')
      var selectedHost = _selectedHost[0]
      var setSelectedHost = _selectedHost[1]

      useEffect(function () {
        if (!open) return
        var measure = function () {
          if (typeof document !== 'undefined' && document.hidden) return
          var t0 = getNow()
          fetch('/dsh-lanmode/health?format=json', { cache: 'no-store' })
            .then(function (r) {
              if (!r.ok) {
                setRtt(null)
                setRttError(translate('loadHttp') + ' ' + r.status)
                return
              }
              return r.text().then(function (text) {
                if (!text) {
                  setRtt(null)
                  setRttError(translate('loadEmpty'))
                  return
                }
                setRttError('')
                setRtt(Math.round(getNow() - t0))
              })
            })
            .catch(function () {
              setRtt(null)
              setRttError(translate('loadFailed'))
            })
        }
        measure()
        var iv = setInterval(measure, 15000)

        // Fetch categorized network interfaces (Feature 4)
        fetch('/dsh-lanmode/api/interfaces', { cache: 'no-store' })
          .then(function (r) { return r.json() })
          .then(function (data) {
            if (Array.isArray(data) && data.length > 0) {
              setInterfaces(data)
              if (!selectedHost) {
                var first = data[0]
                setSelectedHost(first.address || first.url || window.location.hostname)
              }
            }
          })
          .catch(function () {})

        var onVisible = function () {
          if (document.visibilityState === 'visible') measure()
        }
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', onVisible)
        }
        return function () {
          clearInterval(iv)
          if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', onVisible)
          }
        }
      }, [open, selectedHost])

      var targetUrl = useMemo(function () {
        if (!selectedHost) return window.location.origin
        var protocol = window.location.protocol
        var port = window.location.port ? ':' + window.location.port : ''
        return protocol + '//' + selectedHost + port
      }, [selectedHost])

      var copyUrl = function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(targetUrl).then(function () {
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
            title: translate('quickQrTitle'),
            'aria-label': translate('quickQrTitle'),
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
              background: 'var(--dsw-alias-mask-bg, rgba(0,0,0,0.6))',
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
                background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-3))',
                border: '1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1))',
                borderRadius: '16px',
                padding: '24px',
                maxWidth: '380px',
                width: '100%',
                boxShadow: 'var(--dsw-alias-shadow-l3, 0 12px 32px rgba(0,0,0,0.5))',
                color: 'var(--dsw-alias-label-primary)',
                position: 'relative',
              },
            },
            React.createElement(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
              React.createElement('div', { style: { fontWeight: 600, fontSize: '16px' } }, translate('quickQrTitle')),
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

            // Feature 4: Interface Selector Pills
            interfaces.length > 1 && React.createElement(
              'div',
              { className: 'lm-pills' },
              interfaces.map(function (iface) {
                var isSel = (iface.address === selectedHost) || (iface.name === selectedHost)
                return React.createElement(
                  'button',
                  {
                    key: iface.name + '-' + iface.address,
                    type: 'button',
                    className: 'lm-pill ' + (isSel ? 'lm-pill-active' : ''),
                    onClick: function () { setSelectedHost(iface.address || iface.name) },
                  },
                  (iface.category ? iface.category.toUpperCase() + ': ' : '') + iface.address,
                )
              }),
            ),

            React.createElement(
              'div',
              { className: 'lm-qr-box', style: { textAlign: 'center', padding: '12px' } },
              React.createElement('img', {
                className: 'lm-qr-img',
                src: '/dsh-lanmode/qr?url=' + encodeURIComponent(targetUrl),
                alt: 'LAN QR Code',
                style: { maxWidth: '220px', width: '100%', height: 'auto', background: 'var(--dsw-alias-bg-layer-1, #ffffff)', borderRadius: '8px', padding: '6px' },
              }),
              React.createElement('div', { style: { marginTop: '10px', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, targetUrl),
            ),

            React.createElement(
              'div',
              { style: { display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' } },
              React.createElement(
                'button',
                { type: 'button', className: 'lm-btn lm-btn-primary', style: { flex: 1, minWidth: '110px', justifyContent: 'center' }, onClick: copyUrl },
                copied ? translate('copied') : translate('copyUrl'),
              ),
              (typeof navigator !== 'undefined' && typeof navigator.share === 'function') && React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-btn',
                  style: { justifyContent: 'center' },
                  title: translate('shareUrl'),
                  onClick: function () {
                    try {
                      navigator.share({ title: 'DeepSeek Harness', url: targetUrl }).catch(function () {})
                    } catch (err) { /* bestEffort */ void err }
                  },
                },
                translate('shareUrl'),
              ),
              // Feature 2: 1-Click Apple Configuration Profile
              React.createElement(
                'a',
                {
                  href: '/dsh-lanmode/ca.mobileconfig',
                  download: 'dsh-lanmode.mobileconfig',
                  className: 'lm-btn',
                  style: { justifyContent: 'center' },
                  title: 'Apple iOS/macOS profile with Root CA',
                },
                'iOS (.mobileconfig)',
              ),
              React.createElement(
                'a',
                {
                  href: '/dsh-lanmode/ca.crt',
                  download: 'dsh-lanmode-root-ca.crt',
                  className: 'lm-btn',
                  style: { justifyContent: 'center' },
                  title: 'Root CA for Android/Windows/Linux',
                },
                'CA (.crt)',
              ),
            ),

            React.createElement(
              'div',
              { style: { marginTop: '12px', textAlign: 'center', fontSize: '11px', color: 'var(--dsw-alias-state-success-primary)' } },
              '● ' + (window.location.hostname.endsWith('.local') ? window.location.hostname : 'mDNS') + ' ' + translate('activeMdns') + ' | ' + translate('phoneConnected') + (rtt !== null ? (' | ' + translate('rttLabel') + ': ' + rtt + ' ' + translate('ms')) : '') + (rttError ? (' | ' + rttError) : ''),
            ),
          ),
        ),
      )
    }
    env.QuickQrPopover = QuickQrPopover
  }
})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {});
