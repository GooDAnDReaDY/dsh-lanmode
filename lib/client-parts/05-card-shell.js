;(function (parts) {
  parts.renderCard = function (__lm) {
    var React = __lm.React, page = __lm.page, open = __lm.open, setOpen = __lm.setOpen
    var t = __lm.t, translate = __lm.translate, isSecure = __lm.isSecure, Chevron = __lm.Chevron
      return React.createElement(
        page ? 'div' : 'li',
        { className: page ? 'lm-page' : 'lm-card' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'lm-head',
            style: page ? { display: 'none' } : undefined,
            'aria-expanded': page ? true : open,
            onClick: function () { setOpen(!open) },
          },
          React.createElement(
            'div',
            { style: { flex: 1 } },
            React.createElement('div', { className: 'lm-title' }, t('title') || translate('title')),
            React.createElement('div', { className: 'lm-sub' }, t('sub') || translate('sub')),
          ),
          React.createElement(
            'span',
            { className: 'lm-badge ' + (isSecure ? 'lm-badge-ok' : 'lm-badge-warn') },
            isSecure ? 'HTTPS' : 'HTTP',
          ),
          React.createElement(Chevron, { className: 'lm-chev ' + (open ? 'lm-chev-open' : '') }),
        ),
        (page || open) && React.createElement(
          'div',
          { className: 'lm-body' },
        ...window.__DSH_LANMODE_PARTS.renderBody1(__lm),
        ...window.__DSH_LANMODE_PARTS.renderBody2(__lm),
        ...window.__DSH_LANMODE_PARTS.renderBody3(__lm),
        ),
      )
  }
})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {});
