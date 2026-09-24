;(function (parts) {
  parts.renderBody1 = function (__lm) {
    var React = __lm.React, translate = __lm.translate, setShowQr = __lm.setShowQr, showQr = __lm.showQr
    var copyLanUrl = __lm.copyLanUrl, copied = __lm.copied, forceDesktop = __lm.forceDesktop, toggleForceDesktop = __lm.toggleForceDesktop
    var notifPerm = __lm.notifPerm, requestNotify = __lm.requestNotify, telemetry = __lm.telemetry, formatBytes = __lm.formatBytes
    var devices = __lm.devices, killAllDevices = __lm.killAllDevices, devicesError = __lm.devicesError, setDeviceNickname = __lm.setDeviceNickname
    var revokeDevice = __lm.revokeDevice
    return [
          // Quick connect bar
          React.createElement(
            'div',
            { className: 'lm-row' },
            React.createElement(
              'div',
              null,
              React.createElement('div', { className: 'lm-label' }, translate('quickConnect')),
              React.createElement('div', { className: 'lm-hint' }, window.location.origin),
            ),
            React.createElement(
              'div',
              { style: { display: 'flex', gap: '8px' } },
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-btn lm-btn-primary',
                  onClick: function () { setShowQr(!showQr) },
                },
                translate('openQr'),
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-btn',
                  onClick: copyLanUrl,
                },
                copied ? translate('copied') : translate('copyUrl'),
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
          ),

          // Desktop mode toggle
          React.createElement(
            'div',
            { className: 'lm-row' },
            React.createElement(
              'div',
              null,
              React.createElement('div', { className: 'lm-label' }, translate('desktopMode')),
              React.createElement('div', { className: 'lm-hint' }, translate('desktopModeSub')),
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'lm-btn ' + (forceDesktop ? 'lm-btn-primary' : ''),
                onClick: toggleForceDesktop,
              },
              forceDesktop ? 'ON' : 'OFF',
            ),
          ),

          // Turn notification permission toggle
          React.createElement(
            'div',
            { className: 'lm-row' },
            React.createElement(
              'div',
              null,
              React.createElement('div', { className: 'lm-label' }, translate('notifStatus')),
              React.createElement(
                'div',
                { className: 'lm-hint' },
                notifPerm === 'granted'
                  ? translate('notifGranted')
                  : notifPerm === 'denied'
                  ? translate('notifDenied')
                  : 'default',
              ),
            ),
            notifPerm !== 'granted' && React.createElement(
              'button',
              {
                type: 'button',
                className: 'lm-btn',
                onClick: requestNotify,
              },
              translate('notifEnable'),
            ),
          ),

          // Feature 5: Live Network Telemetry Bar
          React.createElement(
            'div',
            { className: 'lm-telemetry-bar' },
            React.createElement(
              'div',
              { className: 'lm-telemetry-item' },
              React.createElement('div', { className: 'lm-telemetry-val' }, (telemetry.rtt !== null ? telemetry.rtt : '--') + ' ' + translate('ms')),
              React.createElement('div', { className: 'lm-telemetry-lbl' }, translate('telemetryRtt')),
            ),
            React.createElement(
              'div',
              { className: 'lm-telemetry-item' },
              React.createElement('div', { className: 'lm-telemetry-val' }, String(telemetry.activeConnections || 1)),
              React.createElement('div', { className: 'lm-telemetry-lbl' }, translate('telemetryConns')),
            ),
            React.createElement(
              'div',
              { className: 'lm-telemetry-item' },
              React.createElement('div', { className: 'lm-telemetry-val' }, formatBytes(telemetry.totalBytesSent)),
              React.createElement('div', { className: 'lm-telemetry-lbl' }, translate('telemetrySent')),
            ),
            React.createElement(
              'div',
              { className: 'lm-telemetry-item' },
              React.createElement('div', { className: 'lm-telemetry-val' }, formatBytes(telemetry.totalBytesReceived)),
              React.createElement('div', { className: 'lm-telemetry-lbl' }, translate('telemetryRecv')),
            ),
          ),

          // Feature 1: Connected Devices & Session Management
          React.createElement(
            'div',
            { className: 'lm-section-card' },
            React.createElement(
              'div',
              { className: 'lm-section-title' },
              React.createElement('span', null, '💻 ' + translate('devicesTitle')),
              devices.length > 1 && React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-btn lm-btn-danger',
                  style: { fontSize: '11px', padding: '3px 8px' },
                  onClick: killAllDevices,
                },
                translate('deviceRevokeAllOthers'),
              ),
            ),
            React.createElement('div', { className: 'lm-section-desc' }, translate('devicesSub')),
            devicesError
              ? React.createElement('div', { className: 'lm-status-msg lm-status-err', style: { padding: '8px 0' } }, devicesError)
              : devices.length === 0
              ? React.createElement('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', padding: '8px 0' } }, translate('deviceNoDevices'))
              : React.createElement(
                  'table',
                  { className: 'lm-device-table' },
                  React.createElement(
                    'thead',
                    null,
                    React.createElement(
                      'tr',
                      null,
                      React.createElement('th', null, translate('devicesIp')),
                      React.createElement('th', null, translate('devicesUa')),
                      React.createElement('th', null, translate('devicesLastSeen')),
                      React.createElement('th', { style: { textAlign: 'right' } }, translate('devicesActions')),
                    ),
                  ),
                  React.createElement(
                    'tbody',
                    null,
                    devices.map(function (dev) {
                      var isCurrent = dev.ip === window.location.hostname || dev.current === true
                      var pIcon = dev.platform === 'ios' ? '📱' : dev.platform === 'android' ? '🤖' : dev.platform === 'macos' ? '🍎' : dev.platform === 'windows' ? '🪟' : dev.platform === 'linux' ? '🐧' : '💻'
                      var displayName = dev.nickname ? dev.nickname : (dev.name || dev.userAgent || 'Web Client')
                      return React.createElement(
                        'tr',
                        { key: dev.id || dev.ip, className: 'lm-device-row' },
                        React.createElement(
                          'td',
                          null,
                          React.createElement('span', { style: { fontWeight: 500 } }, dev.ip || '--'),
                          isCurrent && React.createElement('span', { className: 'lm-badge lm-badge-ok', style: { marginLeft: '6px', fontSize: '10px', padding: '1px 6px' } }, translate('deviceCurrent')),
                        ),
                        React.createElement(
                          'td',
                          { style: { maxWidth: '200px' } },
                          React.createElement(
                            'div',
                            { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                            React.createElement('span', { title: dev.platform || 'device', style: { fontSize: '13px' } }, pIcon),
                            React.createElement('span', { style: { fontWeight: dev.nickname ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: dev.userAgent || dev.name }, displayName),
                            React.createElement(
                              'button',
                              {
                                type: 'button',
                                style: { background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, fontSize: '11px', padding: '0 2px' },
                                title: translate('deviceSetNickname'),
                                onClick: function () { setDeviceNickname(dev.id, dev.nickname) },
                              },
                              '✏️',
                            ),
                          ),
                          dev.nickname && React.createElement('div', { style: { fontSize: '10.5px', color: 'var(--dsw-alias-text-tertiary, #64748b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, dev.name || dev.browser || ''),
                        ),
                        React.createElement('td', null, (dev.lastSeenAt || dev.lastSeen) ? new Date(dev.lastSeenAt || dev.lastSeen).toLocaleTimeString() : '--'),
                        React.createElement(
                          'td',
                          { style: { textAlign: 'right' } },
                          React.createElement(
                            'button',
                            {
                              type: 'button',
                              className: 'lm-btn lm-btn-danger',
                              style: { padding: '2px 8px', fontSize: '11px' },
                              onClick: function () { revokeDevice(dev.id) },
                            },
                            translate('deviceRevoke'),
                          ),
                        ),
                      )
                    }),
                  ),
                ),
          )
    ]
  }
})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {});
