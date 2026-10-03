;(function (parts) {
  parts.installQr = function (env) {
    var useState = env.useState, useEffect = env.useEffect, getNow = env.getNow, translate = env.translate
    var useMemo = env.useMemo, React = env.React
    function QuickQrPopover(props) {
      var t = (props && props.t) || translate
      var _open = useState(false)
      var open = _open[0]
      var setOpen = _open[1]

      var _qrMode = useState('lan')
      var qrMode = _qrMode[0]
      var setQrMode = _qrMode[1]

      var _tunnelUrl = useState('')
      var tunnelUrl = _tunnelUrl[0]
      var setTunnelUrl = _tunnelUrl[1]

      var _tunnelActive = useState(false)
      var tunnelActive = _tunnelActive[0]
      var setTunnelActive = _tunnelActive[1]

      var _copied = useState(false)
      var copied = _copied[0]
      var setCopied = _copied[1]

      var _rtt = useState(null)
      var rtt = _rtt[0]
      var setRtt = _rtt[1]
      var _rttError = useState('')
      var rttError = _rttError[0]
      var setRttError = _rttError[1]

      var _fingerprint = useState('')
      var fingerprint = _fingerprint[0]
      var setFingerprint = _fingerprint[1]
      var _trustCopied = useState('')
      var trustCopied = _trustCopied[0]
      var setTrustCopied = _trustCopied[1]

      var _interfaces = useState([])
      var interfaces = _interfaces[0]
      var setInterfaces = _interfaces[1]

      var _selectedHost = useState('')
      var selectedHost = _selectedHost[0]
      var setSelectedHost = _selectedHost[1]

      var _listener = useState(null)
      var listener = _listener[0]
      var setListener = _listener[1]

      useEffect(function () {
        if (!open) return
        var measure = function () {
          if (typeof document !== 'undefined' && document.hidden) return
          var t0 = getNow()
          fetch('/dsh-lanmode/health?format=json', { cache: 'no-store' })
            .then(function (r) {
              if (!r.ok) {
                setRtt(null)
                setRttError(t('loadHttp') + ' ' + r.status)
                return
              }
              return r.text().then(function (text) {
                if (!text) {
                  setRtt(null)
                  setRttError(t('loadEmpty'))
                  return
                }
                setRttError('')
                setRtt(Math.round(getNow() - t0))
                try {
                  var report = JSON.parse(text)
                  var fp = report && report.tls && report.tls.fingerprint
                  setFingerprint(fp ? String(fp) : '')
                  if (report && report.listener) {
                    setListener(report.listener)
                  }
                  if (report && report.tunnel) {
                    var tUrl = report.tunnel.publicUrl || ''
                    setTunnelUrl(tUrl)
                    var isAct = Boolean(report.tunnel.active || (tUrl && report.tunnel.status === 'active'))
                    setTunnelActive(isAct)
                    if (!isAct && qrMode === 'wan') setQrMode('lan')
                  }
                } catch (err) {
                  setFingerprint('')
                }
              })
            })
            .catch(function () {
              setRtt(null)
              setRttError(t('loadFailed'))
            })
        }
        measure()
        var iv = setInterval(measure, 15000)

        // Fetch categorized network interfaces (Feature 4, #375)
        fetch('/dsh-lanmode/api/interfaces', { cache: 'no-store' })
          .then(function (r) {
            var s = r.headers && r.headers.get && r.headers.get('x-dsh-listener-scheme')
            var p = r.headers && r.headers.get && r.headers.get('x-dsh-listener-port')
            if (s || p) {
              setListener(function (prev) {
                return Object.assign({}, prev || {}, {
                  scheme: s || (prev && prev.scheme) || 'http',
                  port: p ? Number(p) : (prev && prev.port),
                })
              })
            }
            return r.json()
          })
          .then(function (data) {
            if (Array.isArray(data) && data.length > 0) {
              setInterfaces(data)
              if (!selectedHost) {
                var first = data[0]
                setSelectedHost(first.address || first.name || window.location.hostname)
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
        if (qrMode === 'wan' && tunnelUrl) {
          return tunnelUrl
        }
        if (!selectedHost) return window.location.origin
        var scheme = (listener && listener.scheme) ? listener.scheme : window.location.protocol.replace(/:$/, '')
        var protocol = scheme + ':'
        var portNum = (listener && listener.port != null)
          ? Number(listener.port)
          : (window.location.port ? Number(window.location.port) : (protocol === 'https:' ? 443 : 80))
        var portStr = ''
        if ((protocol === 'http:' && portNum !== 80) || (protocol === 'https:' && portNum !== 443)) {
          portStr = ':' + portNum
        }
        var hostPart = selectedHost
        if (hostPart.indexOf(':') !== -1 && !hostPart.startsWith('[')) {
          hostPart = '[' + hostPart + ']'
        }
        return protocol + '//' + hostPart + portStr
      }, [selectedHost, listener, qrMode, tunnelUrl])

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
            title: t('quickQrTitle'),
            'aria-label': t('quickQrTitle'),
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
              React.createElement('div', { style: { fontWeight: 600, fontSize: '16px' } }, t('quickQrTitle')),
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

            // LAN / WAN Mode Switch (#49)
            React.createElement(
              'div',
              { className: 'lm-pills', style: { marginBottom: '10px' } },
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-pill ' + (qrMode === 'lan' ? 'lm-pill-active' : ''),
                  style: { flex: 1, textAlign: 'center', justifyContent: 'center' },
                  onClick: function () { setQrMode('lan') },
                },
                '🏠 ' + (t('qrModeLan') || 'LAN'),
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-pill ' + (qrMode === 'wan' ? 'lm-pill-active' : ''),
                  style: {
                    flex: 1,
                    textAlign: 'center',
                    justifyContent: 'center',
                    opacity: tunnelActive ? 1 : 0.45,
                    cursor: tunnelActive ? 'pointer' : 'not-allowed',
                  },
                  disabled: !tunnelActive,
                  title: tunnelActive ? (tunnelUrl || '') : (t('qrWanUnavailable') || 'WAN tunnel inactive'),
                  onClick: function () {
                    if (tunnelActive) setQrMode('wan')
                  },
                },
                '🌐 ' + (t('qrModeWan') || 'WAN') + (tunnelActive ? '' : ' (' + (t('tunnelOff') || 'off') + ')'),
              ),
            ),

            // Feature 4: Interface Selector Pills (only in LAN mode)
            (qrMode === 'lan' && interfaces.length > 1) && React.createElement(
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

            // WAN status banner (in WAN mode)
            (qrMode === 'wan') && React.createElement(
              'div',
              { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', textAlign: 'center', marginBottom: '6px' } },
              '☁️ ' + (t('qrWanStatus') || 'Cloudflare WAN Tunnel') + ': ' + (tunnelUrl || ''),
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
                copied ? t('copied') : t('copyUrl'),
              ),
              (typeof navigator !== 'undefined' && typeof navigator.share === 'function') && React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-btn',
                  style: { justifyContent: 'center' },
                  title: t('shareUrl'),
                  onClick: function () {
                    try {
                      navigator.share({ title: 'DeepSeek Harness', url: targetUrl }).catch(function () {})
                    } catch (err) { /* bestEffort */ void err }
                  },
                },
                t('shareUrl'),
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
                  title: t('downloadCa'),
                },
                t('downloadCa'),
              ),

              React.createElement(
                'a',
                {
                  href: '/dsh-lanmode/ca.der',
                  download: 'dsh-lanmode-root-ca.der',
                  className: 'lm-btn',
                  style: { justifyContent: 'center' },
                  title: t('downloadCaDer'),
                },
                t('downloadCaDer'),
              ),
            ),

            fingerprint && React.createElement(
              'div',
              { style: { marginTop: '14px', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1))', background: 'var(--dsw-alias-bg-layer-3, transparent)', textAlign: 'left' } },
              React.createElement('div', { style: { fontWeight: 600, fontSize: '12px', marginBottom: '4px' } }, t('tlsTrustTitle')),
              React.createElement('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', marginBottom: '8px' } }, t('tlsTrustHint')),
              React.createElement('div', { style: { fontSize: '11px', wordBreak: 'break-all', marginBottom: '8px' } }, t('tlsFingerprint') + ': ' + fingerprint),
              React.createElement(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                [
                  { id: 'win', label: 'Windows', cmd: 'certutil -addstore -f "ROOT" dsh-lanmode-root-ca.crt' },
                  { id: 'mac', label: 'macOS', cmd: 'sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain dsh-lanmode-root-ca.crt' },
                  { id: 'linux', label: 'Linux', cmd: 'sudo cp dsh-lanmode-root-ca.crt /usr/local/share/ca-certificates/dsh-lanmode.crt && sudo update-ca-certificates' },
                ].map(function (item) {
                  return React.createElement(
                    'button',
                    {
                      key: item.id,
                      type: 'button',
                      className: 'lm-btn',
                      style: { justifyContent: 'flex-start', fontSize: '11px' },
                      title: item.cmd,
                      onClick: function () {
                        var done = function () {
                          setTrustCopied(item.id)
                          setTimeout(function () { setTrustCopied('') }, 1500)
                        }
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          navigator.clipboard.writeText(item.cmd).then(done).catch(function () {
                            try {
                              var area = document.createElement('textarea')
                              area.value = item.cmd
                              document.body.appendChild(area)
                              area.select()
                              document.execCommand('copy')
                              document.body.removeChild(area)
                              done()
                            } catch (err) { /* bestEffort */ void err }
                          })
                        }
                      },
                    },
                    (trustCopied === item.id ? t('trustCmdCopied') : t('copyTrustCmd')) + ' · ' + item.label,
                  )
                }),
              ),
            ),

            React.createElement(
              'div',
              { style: { marginTop: '12px', textAlign: 'center', fontSize: '11px', color: 'var(--dsw-alias-state-success-primary)' } },
              '● ' + (window.location.hostname.endsWith('.local') ? window.location.hostname : 'mDNS') + ' ' + t('activeMdns') + ' | ' + t('phoneConnected') + (rtt !== null ? (' | ' + t('rttLabel') + ': ' + rtt + ' ' + t('ms')) : '') + (rttError ? (' | ' + rttError) : ''),
            ),
          ),
        ),
      )
    }
    env.QuickQrPopover = QuickQrPopover
  }
})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {});
