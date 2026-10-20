;(function (parts) {
parts.renderBody3 = function (__lm) {
 var React = __lm.React, translate = __lm.translate
 var updater = __lm.updater, updaterBusy = __lm.updaterBusy
 var handleCheckUpdate = __lm.handleCheckUpdate, handlePerformUpdate = __lm.handlePerformUpdate
 var updaterMsg = __lm.updaterMsg, updaterErr = __lm.updaterErr

 var tsFunnel = __lm.tsFunnel || {}
 var funnel = tsFunnel.funnel || {}

 return [
 // SECTION: Tailscale Funnel (#467)
 React.createElement(
  'div',
  { className: 'lm-section-card', style: { marginTop: '8px' } },
  React.createElement(
   'div',
   { className: 'lm-section-head', style: { marginBottom: '8px' } },
   React.createElement('span', null, '🌐 ' + translate('tsFunnelTitle')),
   React.createElement('span', { className: 'lm-section-desc' }, translate('tsFunnelDesc')),
  ),
  React.createElement(
   'div',
   {
    style: {
     padding: '12px 14px',
     background: 'var(--dsw-alias-bg-layer-2, transparent)',
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
     React.createElement(
      'span',
      {
       className: 'lm-badge ' + (!funnel.available ? 'lm-badge-neutral' : (funnel.enabled ? 'lm-badge-ok' : 'lm-badge-neutral')),
      },
      !funnel.available
       ? translate('tsFunnelUnavailable')
       : (funnel.enabled ? translate('tsFunnelStatusOn') : translate('tsFunnelStatusOff')),
     ),
     funnel.host && React.createElement(
      'span',
      { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px' } },
      funnel.host,
     ),
    ),
    React.createElement(
     'div',
     { style: { display: 'flex', gap: '8px' } },
     React.createElement(
      'button',
      {
       type: 'button',
       className: 'lm-btn ' + (funnel.enabled ? 'lm-btn-danger' : 'lm-btn-primary'),
       disabled: Boolean(tsFunnel.busy || !funnel.available),
       onClick: tsFunnel.toggle,
      },
      tsFunnel.busy ? '...' : (funnel.enabled ? translate('tsFunnelDisable') : translate('tsFunnelEnable')),
     ),
    ),
   ),
   funnel.enabled && funnel.url && React.createElement(
    'div',
    {
     style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 10px',
      background: 'var(--dsw-alias-bg-layer-1, transparent)',
      borderRadius: '6px',
      border: '1px solid var(--dsw-alias-border-l1)',
      fontSize: '12px',
      gap: '8px',
      flexWrap: 'wrap',
     },
    },
    React.createElement(
     'a',
     {
      href: funnel.url,
      target: '_blank',
      rel: 'noreferrer',
      style: { color: 'var(--dsw-alias-brand-primary, #0a84ff)', textDecoration: 'none', wordBreak: 'break-all' },
     },
     funnel.url,
    ),
    React.createElement(
     'button',
     {
      type: 'button',
      className: 'lm-btn',
      style: { fontSize: '11px', padding: '3px 8px' },
      onClick: tsFunnel.copy,
     },
     tsFunnel.copied ? translate('tsFunnelCopied') : translate('tsFunnelCopy'),
    ),
   ),
   tsFunnel.err && React.createElement('div', { className: 'lm-status-msg lm-status-err' }, tsFunnel.err),
  ),
 ),

 // SECTION 8: Plugin Updater (#134)
 React.createElement(
  'div',
  { className: 'lm-section-card', style: { marginTop: '8px' } },
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
   background: 'var(--dsw-alias-bg-layer-2, transparent)',
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

 // Diagnostic health page link
 React.createElement(
  'div',
  { style: { marginTop: '8px' } },
  React.createElement(
  'a',
  {
   href: '/dsh-lanmode/health',
   target: '_blank',
   rel: 'noreferrer',
   className: 'lm-hint',
   style: { textDecoration: 'none', color: 'var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary))', fontWeight: 500 },
  },
  translate('healthLink'),
  ),
 ),
 ]
}
})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {});
