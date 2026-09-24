;(function (parts) {
  parts.renderBody3 = function (__lm) {
    var React = __lm.React, translate = __lm.translate
    return [


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
                style: { textDecoration: 'none', color: 'var(--dsw-alias-state-brand-primary, var(--dsw-alias-label-primary))', fontWeight: 500 },
              },
              translate('healthLink'),
            ),
          )
    ]
  }
})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {});
