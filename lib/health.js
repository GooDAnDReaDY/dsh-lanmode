// Diagnostics and health reporting.
//
// Generates host status report (JSON) and standalone diagnostic HTML page.

/** Host status report. */
export function hostReport(state) {
  return {
    version: state.version,
    configSource: state.configSource ?? 'defaults',
    configWarning: state.configWarning ?? '',
    mode: state.mode,
    modeReason: state.modeReason ?? '',
    listener: state.listener ?? null,
    tls: state.tls ?? { enabled: false },
    caAvailable: state.caAvailable ?? false,
    mdns: state.mdns ?? false,
    mdnsName: state.mdnsName ?? 'dsh.local',
    lanPin: state.lanPin ?? false,
    unlockPrivileged: state.unlockPrivileged ?? null,
    passwordAuth: state.passwordAuth ?? false,
    authUser: state.authUser ?? 'admin',
    pieces: state.pieces,
    allow: state.allow ?? [],
    adminAllow: state.adminAllow ?? [],
    guestAllow: state.guestAllow ?? [],
    interfaces: state.interfaces ?? [],
    assumptions: state.assumptions ?? [],
  }
}

const BROWSER_SCRIPT = `
(function () {
  var out = document.getElementById('browser')
  var shim = window.__DSH_LANMODE__ || null
  var checks = [
    ['Secure Context (HTTPS)', window.isSecureContext === true,
     'Required for microphone, clipboard, crypto.randomUUID, and PWA capabilities'],
    ['Microphone Access', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
     'Requires HTTPS secure context'],
    ['crypto.randomUUID', typeof (window.crypto && window.crypto.randomUUID) === 'function',
     'Used by UI during initialization; polyfilled over plain HTTP by shim'],
    ['Clipboard API', !!(navigator.clipboard && navigator.clipboard.writeText),
     'Used by copy buttons; polyfilled over plain HTTP by shim'],
    ['Notifications API', 'Notification' in window ? (Notification.permission === 'granted' ? true : Notification.permission) : false,
     'Permission for background completion alerts'],
    ['Script patch injected', 'checking',
     'If missing, verify webServer.tapIndex or ?lanmode=off query parameter'],
    ['Recognized as local origin', /^(localhost|\\[::1\\]|::1|127\\.|dsh\\.local)/.test(location.hostname),
     'Outside localhost, DSH falls back to in-memory settings; restored by plugin']
  ]
  function draw() {
    out.innerHTML = '<table>' + checks.map(function (item) {
      var mark = item[1] === 'checking' ? '...' : (item[1] === true ? '✔' : '✘')
      return '<tr><td>' + mark + '</td><td>' + item[0] + '</td><td>'
        + (item[1] === true || item[1] === 'checking' ? '' : item[2]) + '</td></tr>'
    }).join('') + '</table>'
    window.__DSH_LANMODE_BROWSER__ = checks.map(function (item) {
      return { name: item[0], ok: item[1] }
    })
  }
  draw()

  var at = checks.findIndex(function (item) { return item[0].indexOf('Script patch') === 0 })
  fetch('/', { cache: 'no-store' })
    .then(function (answer) { return answer.text() })
    .then(function (html) { checks[at][1] = html.indexOf('data-dsh-lanmode') !== -1; draw() })
    .catch(function () { checks[at][1] = false; draw() })
})()
`

function row(item) {
  return '<tr><td>' + (item.ok ? '✔' : '✘') + '</td><td>' + escapeHtml(item.name)
    + '</td><td>' + (item.ok ? '' : escapeHtml(item.detail || '')) + '</td></tr>'
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Render complete HTML health status page. */
export function healthPage(state) {
  const report = hostReport(state)
  const listener = report.listener
    ? escapeHtml(report.listener.hosts.map((host) => report.listener.scheme + '://' + host
      + ':' + report.listener.port).join(', '))
    : 'None — network served by existing proxy'
  const privileged = report.unlockPrivileged === null
    ? 'Not applicable in this mode'
    : (report.unlockPrivileged
      ? (report.lanPin
        ? 'PIN-PROTECTED: PIN authentication required for remote clients'
        : 'UNLOCKED: settings and credentials accessible to permitted network clients')
      : 'Locked: settings not readable/writable over network')

  const caLink = report.caAvailable
    ? ' <a href="/dsh-lanmode/ca.crt" download style="color:#6366f1;font-weight:600">[Download Root CA (.crt)]</a>'
      + ' <a href="/dsh-lanmode/ca.mobileconfig" download style="color:#6366f1;font-weight:600">[iOS Profile (.mobileconfig)]</a>'
    : ''

  const qrLink = '<a href="/dsh-lanmode/qr" target="_blank" style="color:#6366f1;font-weight:600">[Show Mobile QR Code]</a>'

  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    + '<title>dsh-lanmode health</title><style>'
    + 'body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px;max-width:900px}'
    + 'h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px}'
    + 'table{border-collapse:collapse;width:100%}'
    + 'td{padding:4px 8px;border-top:1px solid rgba(128,128,128,.3);vertical-align:top}'
    + 'td:first-child{width:1.5em;text-align:center}td:nth-child(2){width:16em}'
    + 'td:nth-child(3){color:#888}dl{margin:0}dt{color:#888;font-size:12px;margin-top:8px}'
    + '@media(prefers-color-scheme:dark){body{background:#111;color:#ddd}}'
    + '</style></head><body>'
    + '<h1>dsh-lanmode ' + escapeHtml(report.version) + '</h1>'
    + '<dl><dt>configuration source</dt><dd>' + escapeHtml(report.configSource)
    + (report.configWarning ? ' <span style="color:#f87171;font-weight:600">(' + escapeHtml(report.configWarning) + ')</span>' : '') + '</dd>'
    + '<dt>mode</dt><dd>' + escapeHtml(report.mode)
    + (report.modeReason ? ' — ' + escapeHtml(report.modeReason) : '') + '</dd>'
    + '<dt>listener</dt><dd>' + listener + '</dd>'
    + '<dt>mDNS (' + escapeHtml(report.mdnsName) + ')</dt><dd>' + (report.mdns ? ('active (' + escapeHtml(report.mdnsName) + ')') : 'disabled') + '</dd>'
    + '<dt>certificate</dt><dd>' + (report.tls.enabled
      ? escapeHtml(report.tls.source + ', fingerprint ' + report.tls.fingerprint) + caLink
      : 'none') + '</dd>'
    + '<dt>quick connect</dt><dd>' + qrLink + '</dd>'
    + '<dt>active shims</dt><dd>' + escapeHtml(Object.entries(report.pieces)
      .filter(([, on]) => on).map(([name]) => name).join(', ') || 'none') + '</dd>'
    + '<dt>password authentication</dt><dd>' + (report.passwordAuth ? ('ENABLED (user: ' + escapeHtml(report.authUser) + ')') : 'disabled') + '</dd>'
    + '<dt>privileged calls</dt><dd>' + escapeHtml(privileged) + '</dd>'
    + '<dt>allowed subnets</dt><dd>' + escapeHtml(report.allow.length ? report.allow.join(', ') : 'all') + '</dd>'
    + '</dl>'
    + '<h2>Mounting Points</h2><table>' + report.assumptions.map(row).join('') + '</table>'
    + '<h2>Browser Context Verification</h2><div id="browser"></div>'
    + '<h2>Diagnostic JSON</h2><p>Machine-readable payload: '
    + '<a href="?format=json">?format=json</a></p>'
    + '<script>' + BROWSER_SCRIPT + '</script></body></html>'
}
