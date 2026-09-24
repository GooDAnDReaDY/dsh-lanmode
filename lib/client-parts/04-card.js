;(function (parts) {
  parts.installCard = function (env) {
    var ensureStyles = env.ensureStyles, translate = env.translate, useState = env.useState, useCallback = env.useCallback
    var takeJson = env.takeJson, loadOutcome = env.loadOutcome, loadMessage = env.loadMessage, useEffect = env.useEffect
    var getNow = env.getNow, React = env.React, formatBytes = env.formatBytes, ErrorBoundary = env.ErrorBoundary
    var Chevron = env.Chevron
    function LanModeCard(props) {
      ensureStyles()
      var t = props.t || translate
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
        } catch (err) { /* bestEffort */ void err }
      }, [forceDesktop])

      var requestNotify = useCallback(function () {
        if (typeof Notification === 'undefined') return
        Notification.requestPermission().then(function (perm) {
          setNotifPerm(perm)
        })
      }, [])

      // Feature 1: Connected Devices & Session Management
      var _devices = useState([])
      var devices = _devices[0]
      var setDevices = _devices[1]
      var _devicesError = useState('')
      var devicesError = _devicesError[0]
      var setDevicesError = _devicesError[1]

      var refreshDevices = useCallback(function () {
        fetch('/dsh-lanmode/devices', { cache: 'no-store' })
          .then(takeJson)
          .then(function (got) {
            var outcome = loadOutcome(got.response, got.body)
            if (!outcome.ok) {
              setDevicesError(loadMessage(outcome))
              return
            }
            if (!Array.isArray(outcome.body)) {
              setDevicesError(translate('loadEmpty'))
              return
            }
            setDevicesError('')
            setDevices(outcome.body)
          })
          .catch(function () { setDevicesError(translate('loadFailed')) })
      }, [])

      useEffect(function () {
        if (!open) return
        refreshDevices()
        var iv = setInterval(refreshDevices, 20000)
        return function () { clearInterval(iv) }
      }, [open, refreshDevices])

      var revokeDevice = useCallback(function (id) {
        if (!window.confirm(translate('deviceRevokeConfirm'))) return
        fetch('/dsh-lanmode/devices/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: id }),
        }).then(function () { refreshDevices() })
      }, [refreshDevices])

      var killAllDevices = useCallback(function () {
        if (!window.confirm(translate('deviceRevokeAllConfirm'))) return
        fetch('/dsh-lanmode/devices/kill-all', { method: 'POST' }).then(function () { refreshDevices() })
      }, [refreshDevices])

      var setDeviceNickname = useCallback(function (id, currentNick) {
        var next = window.prompt(translate('deviceNicknamePrompt'), currentNick || '')
        if (next === null) return
        fetch('/dsh-lanmode/devices/nickname', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: id, nickname: next.trim() }),
        }).then(function () { refreshDevices() })
      }, [refreshDevices])

      // Feature 5: Live Network Telemetry
      var _telemetry = useState({ activeConnections: 0, totalBytesSent: 0, totalBytesReceived: 0, rtt: null })
      var telemetry = _telemetry[0]
      var setTelemetry = _telemetry[1]

      var refreshTelemetry = useCallback(function () {
        var t0 = getNow()
        fetch('/dsh-lanmode/api/telemetry', { cache: 'no-store' })
          .then(function (r) { return r.json() })
          .then(function (data) {
            var rtt = Math.round(getNow() - t0)
            setTelemetry({
              activeConnections: data.activeConnections || 0,
              totalBytesSent: data.totalBytesSent || 0,
              totalBytesReceived: data.totalBytesReceived || 0,
              rtt: rtt,
            })
          })
          .catch(function () {})
      }, [])

      useEffect(function () {
        if (!open) return
        refreshTelemetry()
        var iv = setInterval(refreshTelemetry, 5000)
        return function () { clearInterval(iv) }
      }, [open, refreshTelemetry])

      // Cloudflare Tunnel
      var _tunnel = useState({ active: false, publicUrl: null, status: 'stopped' })
      var tunnel = _tunnel[0]
      var setTunnel = _tunnel[1]
      var _tunnelError = useState('')
      var tunnelError = _tunnelError[0]
      var setTunnelError = _tunnelError[1]

      var refreshTunnel = useCallback(function () {
        fetch('/dsh-lanmode/tunnel', { cache: 'no-store' })
          .then(takeJson)
          .then(function (got) {
            var outcome = loadOutcome(got.response, got.body)
            if (!outcome.ok) {
              setTunnelError(loadMessage(outcome))
              return
            }
            setTunnelError('')
            setTunnel(outcome.body)
          })
          .catch(function () { setTunnelError(translate('loadFailed')) })
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
          .then(takeJson)
          .then(function (got) {
            var outcome = loadOutcome(got.response, got.body)
            if (!outcome.ok) {
              setTunnelError(loadMessage(outcome))
              return
            }
            setTunnelError('')
            setTunnel(outcome.body)
          })
          .catch(function () { setTunnelError(translate('loadFailed')) })
      }, [tunnel.active])

      // Feature: Plugin Updater (#134)
      var _updater = useState(null)
      var updater = _updater[0]
      var setUpdater = _updater[1]

      var _updaterBusy = useState(false)
      var updaterBusy = _updaterBusy[0]
      var setUpdaterBusy = _updaterBusy[1]

      var _updaterMsg = useState('')
      var updaterMsg = _updaterMsg[0]
      var setUpdaterMsg = _updaterMsg[1]

      var _updaterErr = useState('')
      var updaterErr = _updaterErr[0]
      var setUpdaterErr = _updaterErr[1]

      var loadUpdaterStatus = useCallback(function () {
        fetch('/api/dsh-lanmode/update')
          .then(takeJson)
          .then(function (got) {
            var outcome = loadOutcome(got.response, got.body)
            if (!outcome.ok) {
              setUpdaterErr(loadMessage(outcome))
              return
            }
            if (!outcome.body || !outcome.body.name) {
              setUpdaterErr(translate('loadEmpty'))
              return
            }
            setUpdaterErr('')
            setUpdater(outcome.body)
          })
          .catch(function () { setUpdaterErr(translate('loadFailed')) })
      }, [])

      useEffect(function () {
        if (!open) return
        loadUpdaterStatus()
      }, [open, loadUpdaterStatus])

      var handleCheckUpdate = useCallback(function () {
        setUpdaterBusy(true)
        setUpdaterMsg('')
        setUpdaterErr('')
        fetch('/api/dsh-lanmode/update', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-dsh-plugin-update': '1',
          },
          body: JSON.stringify({ action: 'check' }),
        })
          .then(function (r) { return r.json() })
          .then(function (res) {
            setUpdaterBusy(false)
            if (res && res.error) {
              setUpdaterErr(translate('updaterError') + res.error)
            } else if (res) {
              setUpdater(res)
              if (res.updateAvailable) {
                setUpdaterMsg(translate('updaterUpdateAvailable') + ' (' + (res.latestVersion || '') + ')')
              } else {
                setUpdaterMsg(translate('updaterUpToDate'))
              }
            }
          })
          .catch(function (err) {
            setUpdaterBusy(false)
            setUpdaterErr(translate('updaterError') + ((err && err.message) || String(err)))
          })
      }, [])

      var handlePerformUpdate = useCallback(function () {
        setUpdaterBusy(true)
        setUpdaterMsg('')
        setUpdaterErr('')
        fetch('/api/dsh-lanmode/update', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-dsh-plugin-update': '1',
          },
          body: JSON.stringify({ action: 'update' }),
        })
          .then(function (r) { return r.json() })
          .then(function (res) {
            setUpdaterBusy(false)
            if (res && res.error) {
              setUpdaterErr(translate('updaterError') + res.error)
            } else if (res && res.success) {
              setUpdaterMsg(translate('updaterSuccess'))
              loadUpdaterStatus()
            } else {
              setUpdaterErr(translate('updaterError') + ((res && res.message) || 'Unknown error'))
            }
          })
          .catch(function (err) {
            setUpdaterBusy(false)
            setUpdaterErr(translate('updaterError') + ((err && err.message) || String(err)))
          })
      }, [loadUpdaterStatus])

      // DSH 0.1.7+: settingsScope removed. Load config from HTTP API.
      var _snap = useState(function () {
        return { status: 'loading', value: null }
      })
      var snapshot = _snap[0]
      var setSnapshot = _snap[1]

      useEffect(function () {
        var cancelled = false
        fetch('/dsh-lanmode/api/config')
          .then(function (res) { return res.json() })
          .then(function (data) {
            if (!cancelled) setSnapshot(data || { status: 'unavailable', value: null })
          })
          .catch(function () {
            if (!cancelled) setSnapshot({ status: 'unavailable', value: null })
          })
        return function () { cancelled = true }
      }, [])

      var snapStatus = (snapshot && snapshot.status) || 'loading'
      var storedConfig = (snapshot && snapshot.value) || {}

      var _draft = useState(null)
      var draft = _draft[0]
      var setDraft = _draft[1]

      var _saving = useState(false)
      var saving = _saving[0]
      var setSaving = _saving[1]

      var _saveMsg = useState('')
      var saveMsg = _saveMsg[0]
      var setSaveMsg = _saveMsg[1]

      var _saveErr = useState('')
      var saveErr = _saveErr[0]
      var setSaveErr = _saveErr[1]

      var handleLogout = useCallback(function () {
        if (!window.confirm(translate('logoutConfirm'))) return
        fetch('/dsh-lanmode/auth/logout', { method: 'POST' })
          .then(function () { window.location.href = '/' })
          .catch(function () { window.location.href = '/' })
      }, [])

      useEffect(function () {
        if (snapStatus === 'ready' && draft === null) {
          setDraft({
            mode: storedConfig.mode || 'auto',
            directPort: storedConfig.directPort !== undefined ? String(storedConfig.directPort) : '3088',
            tls: storedConfig.tls || 'self-signed',
            tlsHosts: Array.isArray(storedConfig.tlsHosts) ? storedConfig.tlsHosts.join(', ') : '',
            tlsCert: storedConfig.tlsCert || '',
            tlsKey: storedConfig.tlsKey || '',
            allow: Array.isArray(storedConfig.allow) ? storedConfig.allow.join(', ') : '',
            adminAllow: Array.isArray(storedConfig.adminAllow) ? storedConfig.adminAllow.join(', ') : '',
            guestAllow: Array.isArray(storedConfig.guestAllow) ? storedConfig.guestAllow.join(', ') : '',
            unlockPrivileged: storedConfig.unlockPrivileged !== false,
            lanPinRef: storedConfig.lanPinRef || '',
            privilegedExtra: Array.isArray(storedConfig.privilegedExtra) ? storedConfig.privilegedExtra.join(', ') : '',
            streamTimeoutMs: storedConfig.streamTimeoutMs !== undefined ? String(storedConfig.streamTimeoutMs) : '0',

            mdns: storedConfig.mdns !== false,
            mdnsName: storedConfig.mdnsName || 'dsh.local',
            pwa: storedConfig.pwa !== false,
            mobileEnterSends: Boolean(storedConfig.mobileEnterSends),
            diagnostics: storedConfig.diagnostics !== false,

            settings: storedConfig.settings !== false,
            randomUuid: storedConfig.randomUuid !== false,
            clipboard: storedConfig.clipboard !== false,

            passwordAuth: Boolean(storedConfig.passwordAuth),
            authUser: storedConfig.authUser !== undefined ? storedConfig.authUser : 'admin',
            publicHost: storedConfig.publicHost || '',
            authPassword: storedConfig.authPassword !== undefined ? storedConfig.authPassword : '',
            authPasswordRef: storedConfig.authPasswordRef || '',
            authSessionDays: storedConfig.authSessionDays !== undefined ? String(storedConfig.authSessionDays) : '30',

            tunnel: storedConfig.tunnel || 'off',
            tunnelTokenRef: storedConfig.tunnelTokenRef || '',
            tunnelPin: storedConfig.tunnelPin !== false,
          })
        }
      }, [snapStatus, storedConfig, draft])

      var saveSettings = useCallback(function () {
        if (!draft || snapStatus === 'unavailable') return
        setSaving(true)
        setSaveMsg('')
        setSaveErr('')

        var parseList = function (s) {
          return (s || '').split(',').map(function (x) { return x.trim() }).filter(Boolean)
        }

        var p = parseInt(draft.directPort, 10)
        var st = parseInt(draft.streamTimeoutMs, 10)
        var sessDays = parseInt(draft.authSessionDays, 10)

        var payload = {
          mode: draft.mode,
          directPort: isNaN(p) ? 3088 : p,
          tls: draft.tls,
          tlsHosts: parseList(draft.tlsHosts),
          tlsCert: String(draft.tlsCert || '').trim(),
          tlsKey: String(draft.tlsKey || '').trim(),
          allow: parseList(draft.allow),
          adminAllow: parseList(draft.adminAllow),
          guestAllow: parseList(draft.guestAllow),
          unlockPrivileged: Boolean(draft.unlockPrivileged),
          lanPinRef: String(draft.lanPinRef || '').trim(),
          privilegedExtra: parseList(draft.privilegedExtra),
          streamTimeoutMs: isNaN(st) || st < 0 ? 0 : st,
          mdns: Boolean(draft.mdns),
          mdnsName: String(draft.mdnsName || 'dsh.local').trim(),
          pwa: Boolean(draft.pwa),
          mobileEnterSends: Boolean(draft.mobileEnterSends),
          diagnostics: Boolean(draft.diagnostics),
          settings: Boolean(draft.settings),
          randomUuid: Boolean(draft.randomUuid),
          clipboard: Boolean(draft.clipboard),
          passwordAuth: Boolean(draft.passwordAuth),
          authUser: String(draft.authUser || 'admin').trim(),
          publicHost: String(draft.publicHost || '').trim(),
          authSessionDays: isNaN(sessDays) || sessDays < 1 ? 30 : sessDays,
          tunnel: draft.tunnel,
          tunnelPin: Boolean(draft.tunnelPin),
        }

        if (draft.authPassword !== undefined) payload.authPassword = String(draft.authPassword)
        if (draft.authPasswordRef !== undefined) payload.authPasswordRef = String(draft.authPasswordRef).trim()
        if (draft.tunnelTokenRef !== undefined) payload.tunnelTokenRef = String(draft.tunnelTokenRef).trim()

        fetch('/dsh-lanmode/api/config', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(function (res) { return res.json() })
          .then(function (data) {
            setSaving(false)
            if (data && data.errors && data.errors.length > 0) {
              setSaveErr(translate('saveError') + data.errors.map(function (e) { return e.key + ': ' + e.error }).join('; '))
            } else {
              setSaveMsg(translate('saveSuccess') + (data && data.restart ? ' ' + translate('restartHint') : ''))
              setTimeout(function () { setSaveMsg('') }, 5000)
            }
          })
          .catch(function (err) {
            setSaving(false)
            setSaveErr(translate('saveError') + ((err && err.message) || String(err)))
          })
      }, [draft])

      // Row seat (plugins.row.config): the host page draws title/icon/crumb and the
      // padding, so the summary is a one-liner and the page drops our card chrome.
      var page = !!(props && props.view === 'page')
      if (props && props.view === 'summary') {
        return React.createElement('span', { className: 'lm-sub' }, t('subtitle') || '')
      }
      var __lm = {
      React: React, translate: translate, setShowQr: setShowQr, showQr: showQr,
      copyLanUrl: copyLanUrl, copied: copied, forceDesktop: forceDesktop, toggleForceDesktop: toggleForceDesktop,
      notifPerm: notifPerm, requestNotify: requestNotify, telemetry: telemetry, formatBytes: formatBytes,
      devices: devices, killAllDevices: killAllDevices, devicesError: devicesError, setDeviceNickname: setDeviceNickname,
      revokeDevice: revokeDevice, ErrorBoundary: ErrorBoundary, t: t, snapStatus: snapStatus,
      draft: draft, setDraft: setDraft, tunnelError: tunnelError, tunnel: tunnel,
      saving: saving, saveSettings: saveSettings, storedConfig: storedConfig, handleLogout: handleLogout,
      saveMsg: saveMsg, saveErr: saveErr, updater: updater, updaterBusy: updaterBusy,
      handleCheckUpdate: handleCheckUpdate, handlePerformUpdate: handlePerformUpdate, updaterMsg: updaterMsg, updaterErr: updaterErr,
      page: page, open: open, setOpen: setOpen, isSecure: isSecure,
      Chevron: Chevron
      }
      return window.__DSH_LANMODE_PARTS.renderCard(__lm)
    }
    env.LanModeCard = LanModeCard
  }
})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {});
