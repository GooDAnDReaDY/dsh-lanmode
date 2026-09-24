;(function (parts) {
  parts.installPrelude = function (env) {
    var require = env.require
    var module = { exports: {} }
    var React = require('react')
    var useState = React.useState
    var useEffect = React.useEffect
    var useCallback = React.useCallback
    var useMemo = React.useMemo

    var NS = 'dsh-lanmode'
    // Plugins page row seat (DSH 0.1.6-alpha.2): key = '<package name>#<row id>'.
    var PKG = '@goodandready/dsh-lanmode'
    var ROW_ID = 'dsh-lanmode'
    var ROW_CONFIG_KEY = PKG + '#' + ROW_ID

    var ChevronIcon = null
    try {
      var primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      ChevronIcon = primitives && primitives.IconChevronDownOutline14
    } catch (_) {
      ChevronIcon = null
    }

    function FallbackChevron(props) {
      return React.createElement(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 14 14',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className: props.className,
          style: props.style,
        },
        React.createElement('path', { d: 'm3.5 5.25 3.5 3.5 3.5-3.5' }),
      )
    }

    var Chevron = ChevronIcon || FallbackChevron
    env.module = module
    env.React = React
    env.useState = useState
    env.useEffect = useEffect
    env.useCallback = useCallback
    env.useMemo = useMemo
    env.NS = NS
    env.PKG = PKG
    env.ROW_ID = ROW_ID
    env.ROW_CONFIG_KEY = ROW_CONFIG_KEY
    env.Chevron = Chevron
  }
})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {});
