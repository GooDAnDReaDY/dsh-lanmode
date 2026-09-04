// Страница диагностики.
//
// Каждый разбор поломки по сети начинался одинаково: непонятно, какой режим,
// что подменено, видит ли браузер защищённое соединение и почему молчит
// микрофон. Это выяснялось руками и подолгу.
//
// Половину ответов знает хост, половину — только браузер, потому что защищённое
// соединение и наличие микрофона существуют исключительно на его стороне.
// Поэтому страница отдаёт и то и другое: серверное как есть, браузерное —
// скриптом, который выполняется у открывшего.

/** Данные, которые знает хост. */
export function hostReport(state) {
  return {
    version: state.version,
    mode: state.mode,
    modeReason: state.modeReason ?? '',
    listener: state.listener ?? null,
    tls: state.tls ?? { enabled: false },
    caAvailable: state.caAvailable ?? false,
    mdns: state.mdns ?? false,
    mdnsName: state.mdnsName ?? 'dsh.local',
    lanPin: state.lanPin ?? false,
    unlockPrivileged: state.unlockPrivileged ?? null,
    pieces: state.pieces,
    allow: state.allow ?? [],
    assumptions: state.assumptions ?? [],
  }
}

const BROWSER_SCRIPT = `
(function () {
  var out = document.getElementById('browser')
  var shim = window.__DSH_LANMODE__ || null
  var checks = [
    ['защищённое соединение', window.isSecureContext === true,
     'без него нет ни микрофона, ни crypto.randomUUID, ни буфера обмена. Лечится HTTPS: настройка tls в прямом режиме или прокси с сертификатом'],
    ['микрофон доступен браузеру', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
     'единственное, чего не лечит подмена: за ним настоящее устройство. Нужен именно HTTPS'],
    ['crypto.randomUUID', typeof (window.crypto && window.crypto.randomUUID) === 'function',
     'интерфейс зовёт его при загрузке; на голом HTTP его подставляет заплатка'],
    ['буфер обмена', !!(navigator.clipboard && navigator.clipboard.writeText),
     'кнопки «копировать»; на голом HTTP его подставляет заплатка'],
    ['уведомления (Notifications API)', 'Notification' in window ? (Notification.permission === 'granted' ? true : Notification.permission) : false,
     'разрешение на получение уведомлений о завершении генерации ответа'],
    ['заплатка на странице интерфейса', 'проверяется',
     'если нет — скрипт не попал на страницу или его выключили через ?lanmode=off'],
    ['страница считается своей', /^(localhost|\\[::1\\]|::1|127\\.|dsh\\.local)/.test(location.hostname),
     'на чужом имени харнесс уводит настройки в режим памяти; это и чинит заплатка']
  ]
  function draw() {
    out.innerHTML = '<table>' + checks.map(function (item) {
      var mark = item[1] === 'проверяется' ? '…' : (item[1] === true ? '✔' : '✘')
      return '<tr><td>' + mark + '</td><td>' + item[0] + '</td><td>'
        + (item[1] === true || item[1] === 'проверяется' ? '' : item[2]) + '</td></tr>'
    }).join('') + '</table>'
    window.__DSH_LANMODE_BROWSER__ = checks.map(function (item) {
      return { name: item[0], ok: item[1] }
    })
  }
  draw()

  var at = checks.findIndex(function (item) { return item[0].indexOf('заплатка') === 0 })
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

/** Страница целиком. */
export function healthPage(state) {
  const report = hostReport(state)
  const listener = report.listener
    ? escapeHtml(report.listener.hosts.map((host) => report.listener.scheme + '://' + host
      + ':' + report.listener.port).join(', '))
    : 'нет — сеть обслуживает кто-то другой'
  const privileged = report.unlockPrivileged === null
    ? 'не применимо в этом режиме'
    : (report.unlockPrivileged
      ? (report.lanPin
        ? 'ОТКРЫТЫ С PIN: требуется авторизация по PIN-коду для не-локальных клиентов'
        : 'ОТКРЫТЫ: настройки и учётные данные доступны любому, кто дотянулся до порта')
      : 'закрыты: настройки по сети не читаются и не пишутся')

  const caLink = report.caAvailable
    ? ' <a href="/dsh-lanmode/ca.crt" download style="color:#6366f1;font-weight:600">[Скачать Root CA (.crt)]</a>'
    : ''

  const qrLink = '<a href="/dsh-lanmode/qr" target="_blank" style="color:#6366f1;font-weight:600">[Показать QR-код для телефона]</a>'

  return '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    + '<title>dsh-lanmode</title><style>'
    + 'body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px;max-width:900px}'
    + 'h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px}'
    + 'table{border-collapse:collapse;width:100%}'
    + 'td{padding:4px 8px;border-top:1px solid rgba(128,128,128,.3);vertical-align:top}'
    + 'td:first-child{width:1.5em;text-align:center}td:nth-child(2){width:16em}'
    + 'td:nth-child(3){color:#888}dl{margin:0}dt{color:#888;font-size:12px;margin-top:8px}'
    + '@media(prefers-color-scheme:dark){body{background:#111;color:#ddd}}'
    + '</style></head><body>'
    + '<h1>dsh-lanmode ' + escapeHtml(report.version) + '</h1>'
    + '<dl><dt>режим</dt><dd>' + escapeHtml(report.mode)
    + (report.modeReason ? ' — ' + escapeHtml(report.modeReason) : '') + '</dd>'
    + '<dt>слушатель</dt><dd>' + listener + '</dd>'
    + '<dt>mDNS (' + escapeHtml(report.mdnsName) + ')</dt><dd>' + (report.mdns ? ('активен (' + escapeHtml(report.mdnsName) + ')') : 'выключен') + '</dd>'
    + '<dt>сертификат</dt><dd>' + (report.tls.enabled
      ? escapeHtml(report.tls.source + ', отпечаток ' + report.tls.fingerprint) + caLink
      : 'нет') + '</dd>'
    + '<dt>быстрый вход</dt><dd>' + qrLink + '</dd>'
    + '<dt>подменено</dt><dd>' + escapeHtml(Object.entries(report.pieces)
      .filter(([, on]) => on).map(([name]) => name).join(', ') || 'ничего') + '</dd>'
    + '<dt>привилегированные вызовы</dt><dd>' + escapeHtml(privileged) + '</dd>'
    + '<dt>пускаю</dt><dd>' + escapeHtml(report.allow.length ? report.allow.join(', ') : 'всех') + '</dd>'
    + '</dl>'
    + '<h2>Точки крепления</h2><table>' + report.assumptions.map(row).join('') + '</table>'
    + '<h2>Что видит браузер</h2><div id="browser"></div>'
    + '<h2>Для отчёта об ошибке</h2><p>Те же данные в JSON: '
    + '<a href="?format=json">?format=json</a></p>'
    + '<script>' + BROWSER_SCRIPT + '</script></body></html>'
}
