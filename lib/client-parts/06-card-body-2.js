;(function (parts) {
  parts.renderBody2 = function (__lm) {
    var React = __lm.React, ErrorBoundary = __lm.ErrorBoundary, t = __lm.t, translate = __lm.translate
    var snapStatus = __lm.snapStatus, draft = __lm.draft, setDraft = __lm.setDraft, tunnelError = __lm.tunnelError
    var tunnel = __lm.tunnel, saving = __lm.saving, saveSettings = __lm.saveSettings, storedConfig = __lm.storedConfig
    var handleLogout = __lm.handleLogout, saveMsg = __lm.saveMsg, saveErr = __lm.saveErr, updater = __lm.updater
    var updaterBusy = __lm.updaterBusy, handleCheckUpdate = __lm.handleCheckUpdate, handlePerformUpdate = __lm.handlePerformUpdate, updaterMsg = __lm.updaterMsg
    var updaterErr = __lm.updaterErr
    return [


          // Settings form container
          React.createElement(
            'div',
            { className: 'lm-form-box' },
            React.createElement(
              ErrorBoundary,
              null,
              React.createElement('div', { className: 'lm-form-title' }, '⚙ ' + (t('title') || translate('title'))),
              React.createElement('div', { className: 'lm-form-desc' }, translate('sub')),
              snapStatus === 'loading'
                ? React.createElement('div', { className: 'lm-hint' }, 'Loading configuration snapshot...')
                  : snapStatus === 'unavailable'
                    ? React.createElement('div', { className: 'lm-hint' }, 'Settings snapshot unavailable.')
                    : draft && React.createElement(
                        'div',
                        { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
                        React.createElement(
                          'div',
                          { className: 'lm-grid' },

              // SECTION 1: Listener & Routing
              React.createElement(
                'div',
                { className: 'lm-section-head' },
                React.createElement('span', null, '🌐 ' + translate('secRouting')),
                React.createElement('span', { className: 'lm-section-desc' }, translate('secRoutingDesc')),
              ),
              React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('modeLabel')),
                React.createElement(
                  'select',
                  {
                    className: 'lm-select',
                    value: draft.mode,
                    onChange: function (e) { setDraft(Object.assign({}, draft, { mode: e.target.value })) },
                  },
                  React.createElement('option', { value: 'auto' }, translate('modeAuto')),
                  React.createElement('option', { value: 'direct' }, translate('modeDirect')),
                  React.createElement('option', { value: 'proxy' }, translate('modeProxy')),
                ),
              ),
              React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('directPortLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'number',
                  value: draft.directPort,
                  onChange: function (e) { setDraft(Object.assign({}, draft, { directPort: e.target.value })) },
                }),
              ),
              React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('streamTimeoutLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'number',
                  value: draft.streamTimeoutMs,
                  placeholder: translate('streamTimeoutPh'),
                  onChange: function (e) { setDraft(Object.assign({}, draft, { streamTimeoutMs: e.target.value })) },
                }),
              ),
              React.createElement(
                'div',
                { className: 'lm-field lm-field-full' },
                React.createElement('label', { className: 'lm-field-label' }, translate('privilegedExtraLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'text',
                  value: draft.privilegedExtra,
                  placeholder: translate('privilegedExtraPh'),
                  onChange: function (e) { setDraft(Object.assign({}, draft, { privilegedExtra: e.target.value })) },
                }),
              ),

              // SECTION 2: TLS & HTTPS
              React.createElement(
                'div',
                { className: 'lm-section-head' },
                React.createElement('span', null, '🔒 ' + translate('secTls')),
                React.createElement('span', { className: 'lm-section-desc' }, translate('secTlsDesc')),
              ),
              React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('tlsModeLabel')),
                React.createElement(
                  'select',
                  {
                    className: 'lm-select',
                    value: draft.tls,
                    onChange: function (e) { setDraft(Object.assign({}, draft, { tls: e.target.value })) },
                  },
                  React.createElement('option', { value: 'self-signed' }, translate('tlsSelfSigned')),
                  React.createElement('option', { value: 'files' }, translate('tlsFiles')),
                  React.createElement('option', { value: 'off' }, translate('tlsOff')),
                ),
              ),
              React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('tlsHostsLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'text',
                  value: draft.tlsHosts,
                  placeholder: translate('tlsHostsPh'),
                  onChange: function (e) { setDraft(Object.assign({}, draft, { tlsHosts: e.target.value })) },
                }),
              ),
              draft.tls === 'files' && React.createElement(
                'div',
                { className: 'lm-field lm-field-full' },
                React.createElement('label', { className: 'lm-field-label' }, translate('tlsCertLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'text',
                  value: draft.tlsCert,
                  placeholder: '/etc/ssl/certs/server.crt',
                  onChange: function (e) { setDraft(Object.assign({}, draft, { tlsCert: e.target.value })) },
                }),
              ),
              draft.tls === 'files' && React.createElement(
                'div',
                { className: 'lm-field lm-field-full' },
                React.createElement('label', { className: 'lm-field-label' }, translate('tlsKeyLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'text',
                  value: draft.tlsKey,
                  placeholder: '/etc/ssl/private/server.key',
                  onChange: function (e) { setDraft(Object.assign({}, draft, { tlsKey: e.target.value })) },
                }),
              ),

              // SECTION 3: LAN Access Control & Subnet Roles
              React.createElement(
                'div',
                { className: 'lm-section-head' },
                React.createElement('span', null, '🛡 ' + translate('secAccess')),
                React.createElement('span', { className: 'lm-section-desc' }, translate('secAccessDesc')),
              ),
              React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('lanPinRefLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'text',
                  value: draft.lanPinRef,
                  placeholder: translate('lanPinRefPh'),
                  onChange: function (e) { setDraft(Object.assign({}, draft, { lanPinRef: e.target.value })) },
                }),
              ),
              React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('allowLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'text',
                  value: draft.allow,
                  placeholder: translate('allowPh'),
                  onChange: function (e) { setDraft(Object.assign({}, draft, { allow: e.target.value })) },
                }),
              ),
              React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('adminAllowLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'text',
                  value: draft.adminAllow,
                  placeholder: translate('adminAllowPh'),
                  onChange: function (e) { setDraft(Object.assign({}, draft, { adminAllow: e.target.value })) },
                }),
              ),
              React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('guestAllowLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'text',
                  value: draft.guestAllow,
                  placeholder: translate('guestAllowPh'),
                  onChange: function (e) { setDraft(Object.assign({}, draft, { guestAllow: e.target.value })) },
                }),
              ),
              React.createElement(
                'div',
                { className: 'lm-field lm-field-full' },
                React.createElement(
                  'label',
                  { className: 'lm-checkbox-label' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: draft.unlockPrivileged,
                    onChange: function (e) { setDraft(Object.assign({}, draft, { unlockPrivileged: e.target.checked })) },
                  }),
                  React.createElement('span', null, translate('unlockPrivilegedLabel')),
                ),
              ),

              // SECTION 4: Mobile, mDNS & PWA
              React.createElement(
                'div',
                { className: 'lm-section-head' },
                React.createElement('span', null, '📱 ' + translate('secMobile')),
                React.createElement('span', { className: 'lm-section-desc' }, translate('secMobileDesc')),
              ),
              React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('mdnsNameLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'text',
                  value: draft.mdnsName,
                  placeholder: translate('mdnsNamePh'),
                  onChange: function (e) { setDraft(Object.assign({}, draft, { mdnsName: e.target.value })) },
                }),
              ),
              React.createElement(
                'div',
                { className: 'lm-field lm-field-full' },
                React.createElement(
                  'label',
                  { className: 'lm-checkbox-label' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: draft.mdns,
                    onChange: function (e) { setDraft(Object.assign({}, draft, { mdns: e.target.checked })) },
                  }),
                  React.createElement('span', null, translate('mdnsAnnounceLabel')),
                ),
              ),
              React.createElement(
                'div',
                { className: 'lm-field lm-field-full' },
                React.createElement(
                  'label',
                  { className: 'lm-checkbox-label' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: draft.pwa,
                    onChange: function (e) { setDraft(Object.assign({}, draft, { pwa: e.target.checked })) },
                  }),
                  React.createElement('span', null, translate('pwaLabel')),
                ),
              ),
              React.createElement(
                'div',
                { className: 'lm-field lm-field-full' },
                React.createElement(
                  'label',
                  { className: 'lm-checkbox-label' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: draft.mobileEnterSends,
                    onChange: function (e) { setDraft(Object.assign({}, draft, { mobileEnterSends: e.target.checked })) },
                  }),
                  React.createElement('span', null, translate('mobileEnterLabel')),
                ),
              ),
              React.createElement(
                'div',
                { className: 'lm-field lm-field-full' },
                React.createElement(
                  'label',
                  { className: 'lm-checkbox-label' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: draft.diagnostics,
                    onChange: function (e) { setDraft(Object.assign({}, draft, { diagnostics: e.target.checked })) },
                  }),
                  React.createElement('span', null, translate('diagnosticsLabel')),
                ),
              ),

              // SECTION 5: Polyfills
              React.createElement(
                'div',
                { className: 'lm-section-head' },
                React.createElement('span', null, '🧩 ' + translate('secPolyfills')),
                React.createElement('span', { className: 'lm-section-desc' }, translate('secPolyfillsDesc')),
              ),
              React.createElement(
                'div',
                { className: 'lm-field lm-field-full' },
                React.createElement(
                  'label',
                  { className: 'lm-checkbox-label' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: draft.settings,
                    onChange: function (e) { setDraft(Object.assign({}, draft, { settings: e.target.checked })) },
                  }),
                  React.createElement('span', null, translate('unblockSettingsLabel')),
                ),
              ),
              React.createElement(
                'div',
                { className: 'lm-field lm-field-full' },
                React.createElement(
                  'label',
                  { className: 'lm-checkbox-label' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: draft.randomUuid,
                    onChange: function (e) { setDraft(Object.assign({}, draft, { randomUuid: e.target.checked })) },
                  }),
                  React.createElement('span', null, translate('randomUuidLabel')),
                ),
              ),
              React.createElement(
                'div',
                { className: 'lm-field lm-field-full' },
                React.createElement(
                  'label',
                  { className: 'lm-checkbox-label' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: draft.clipboard,
                    onChange: function (e) { setDraft(Object.assign({}, draft, { clipboard: e.target.checked })) },
                  }),
                  React.createElement('span', null, translate('clipboardLabel')),
                ),
              ),

              // SECTION 6: Auth
              React.createElement(
                'div',
                { className: 'lm-section-head' },
                React.createElement('span', null, '🔐 ' + translate('secAuth')),
                React.createElement('span', { className: 'lm-section-desc' }, translate('secAuthDesc')),
              ),
              React.createElement(
                'div',
                { className: 'lm-field lm-field-full' },
                React.createElement(
                  'label',
                  { className: 'lm-checkbox-label' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: draft.passwordAuth,
                    onChange: function (e) { setDraft(Object.assign({}, draft, { passwordAuth: e.target.checked })) },
                  }),
                  React.createElement('span', null, translate('passwordAuthLabel')),
                ),
              ),
              draft.passwordAuth && React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('authUserLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'text',
                  value: draft.authUser,
                  onChange: function (e) { setDraft(Object.assign({}, draft, { authUser: e.target.value })) },
                }),
              ),
              draft.passwordAuth && React.createElement('div', { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('publicHostLabel')),
                React.createElement('input', { className: 'lm-input', type: 'text', placeholder: translate('publicHostPh'), value: draft.publicHost || '', onChange: function (e) { setDraft(Object.assign({}, draft, { publicHost: e.target.value })) } })),
              draft.passwordAuth && React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('authSessionDaysLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'number',
                  value: draft.authSessionDays,
                  onChange: function (e) { setDraft(Object.assign({}, draft, { authSessionDays: e.target.value })) },
                }),
              ),
              draft.passwordAuth && React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('authPasswordLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'password',
                  value: draft.authPassword,
                  placeholder: translate('authPasswordPh'),
                  onChange: function (e) { setDraft(Object.assign({}, draft, { authPassword: e.target.value })) },
                }),
              ),
              draft.passwordAuth && React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('authPasswordRefLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'text',
                  value: draft.authPasswordRef,
                  placeholder: translate('authPasswordRefPh'),
                  onChange: function (e) { setDraft(Object.assign({}, draft, { authPasswordRef: e.target.value })) },
                }),
              ),

              // SECTION 7: Cloudflare Tunnel
              React.createElement(
                'div',
                { className: 'lm-section-head' },
                React.createElement('span', null, '☁ ' + translate('secTunnel')),
                React.createElement('span', { className: 'lm-section-desc' }, translate('secTunnelDesc')),
              ),
              tunnelError
                ? React.createElement('div', { className: 'lm-status-msg lm-status-err' }, tunnelError)
                : React.createElement('div', { className: 'lm-status-msg' }, translate('tunnelLive') + ': ' + (tunnel.status || '')),
              React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('tunnelModeLabel')),
                React.createElement(
                  'select',
                  {
                    className: 'lm-select',
                    value: draft.tunnel,
                    onChange: function (e) { setDraft(Object.assign({}, draft, { tunnel: e.target.value })) },
                  },
                  React.createElement('option', { value: 'off' }, translate('tunnelOff')),
                  React.createElement('option', { value: 'quick' }, translate('tunnelQuick')),
                  React.createElement('option', { value: 'named' }, translate('tunnelNamed')),
                ),
              ),
              draft.tunnel === 'named' && React.createElement(
                'div',
                { className: 'lm-field' },
                React.createElement('label', { className: 'lm-field-label' }, translate('tunnelTokenRefLabel')),
                React.createElement('input', {
                  className: 'lm-input',
                  type: 'text',
                  value: draft.tunnelTokenRef,
                  placeholder: translate('tunnelTokenRefPh'),
                  onChange: function (e) { setDraft(Object.assign({}, draft, { tunnelTokenRef: e.target.value })) },
                }),
              ),
              draft.tunnel !== 'off' && React.createElement(
                'div',
                { className: 'lm-field lm-field-full' },
                React.createElement(
                  'label',
                  { className: 'lm-checkbox-label' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: draft.tunnelPin,
                    onChange: function (e) { setDraft(Object.assign({}, draft, { tunnelPin: e.target.checked })) },
                  }),
                  React.createElement('span', null, translate('tunnelPinLabel')),
                ),
              ),
            ),

            // Save Actions
            React.createElement(
              'div',
              { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', gap: '12px' } },
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-btn lm-btn-primary',
                  disabled: saving || snapStatus !== 'ready',
                  onClick: saveSettings,
                },
                saving ? translate('saving') : translate('saveSettings'),
              ),
              Boolean(storedConfig.passwordAuth) && React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-btn lm-btn-danger',
                  title: 'Log out of DSH session',
                  onClick: handleLogout,
                },
                translate('logout'),
              ),
            ),

            saveMsg && React.createElement('div', { className: 'lm-status-msg lm-status-ok', style: { marginTop: '8px' } }, saveMsg),
            saveErr && React.createElement('div', { className: 'lm-status-msg lm-status-err', style: { marginTop: '8px' } }, saveErr),

            // SECTION 8: Plugin Updater (#134)
            React.createElement(
              'div',
              { style: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1))' } },
              React.createElement(
                'div',
                { className: 'lm-section-head', style: { marginBottom: '8px' } },
                React.createElement('span', null, '🔄 ' + translate('updaterTitle')),
                React.createElement('span', { className: 'lm-section-desc' }, translate('updaterDesc')),
              ),
              React.createElement(
                'div',
                {
                  style: {
                    padding: '12px 14px',
                    background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-surface-muted, transparent))',
                    borderRadius: '8px',
                    border: '1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1))',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  },
                },
                React.createElement(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    },
                  },
                  React.createElement(
                    'div',
                    { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' } },
                    React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, translate('updaterCurrentVersion')),
                    React.createElement(
                      'span',
                      { className: 'lm-badge lm-badge-neutral' },
                      (updater && updater.currentVersion) || '0.7.19',
                    ),
                    updater && updater.checking && React.createElement(
                      'span',
                      { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px' } },
                      translate('updaterChecking'),
                    ),
                    updater && !updater.checking && updater.updateAvailable && React.createElement(
                      'span',
                      { className: 'lm-badge lm-badge-warn' },
                      translate('updaterUpdateAvailable') + ' (' + (updater.latestVersion || '') + ')',
                    ),
                    updater && !updater.checking && !updater.updateAvailable && updater.checkedAt && React.createElement(
                      'span',
                      { className: 'lm-badge lm-badge-ok' },
                      translate('updaterUpToDate'),
                    ),
                  ),
                  React.createElement(
                    'div',
                    { style: { display: 'flex', gap: '8px' } },
                    React.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'lm-btn',
                        disabled: updaterBusy,
                        onClick: handleCheckUpdate,
                      },
                      updaterBusy ? translate('updaterChecking') : translate('updaterCheckBtn'),
                    ),
                    updater && updater.updateAvailable && React.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'lm-btn lm-btn-primary',
                        disabled: updaterBusy,
                        onClick: handlePerformUpdate,
                      },
                      updaterBusy ? translate('updaterUpdating') : translate('updaterUpdateBtn'),
                    ),
                  ),
                ),
                updaterMsg && React.createElement('div', { className: 'lm-status-msg lm-status-ok' }, updaterMsg),
                updaterErr && React.createElement('div', { className: 'lm-status-msg lm-status-err' }, updaterErr),
                React.createElement(
                  'div',
                  { style: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)' } },
                  translate('updaterRestartNote'),
                ),
              ),
            ),
                      ),
            ),
          )
    ]
  }
})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {});
