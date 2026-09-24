;(function (parts) {
  parts.installStyles = function (env) {
    var React = env.React, translate = env.translate
    var STYLES = `
.lm-card { border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); border-radius:12px; list-style:none; margin-bottom:12px; overflow:hidden }
.lm-head { appearance:none; width:100%; font:inherit; color:inherit; text-align:left; cursor:pointer; background:0 0; border:0; border-radius:12px; display:flex; align-items:center; gap:12px; padding:16px 18px }
.lm-title { color:var(--dsw-alias-label-primary); font-size:15px; font-weight:600; line-height:1.4 }
.lm-sub { color:var(--dsw-alias-label-secondary); font-size:13px; margin-top:2px }
.lm-chev { margin-left:auto; flex:none; color:var(--dsw-alias-label-tertiary); transition:transform .16s }
.lm-chev-open { transform:rotate(180deg) }
.lm-body { border-top:1px solid var(--dsw-alias-border-l2); margin:0 18px; padding:16px 0 20px; display:flex; flex-direction:column; gap:16px }

.lm-section-card { border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-2); border-radius:10px; padding:16px; display:flex; flex-direction:column; gap:12px }
.lm-section-title { font-size:14px; font-weight:600; color:var(--dsw-alias-label-primary); display:flex; align-items:center; justify-content:space-between }
.lm-section-desc { font-size:12px; color:var(--dsw-alias-label-secondary); line-height:1.4; margin-top:-4px }

.lm-form-box { background:var(--dsw-alias-bg-layer-2); border-radius:12px; border:1px solid var(--dsw-alias-border-l2); padding:18px 20px; display:flex; flex-direction:column; gap:14px; margin-top:8px }
.lm-form-title { font-size:15px; font-weight:600; color:var(--dsw-alias-label-primary) }
.lm-form-desc { font-size:13px; color:var(--dsw-alias-label-secondary); line-height:1.4 }
.lm-status-msg { font-size:12px; font-weight:500 }
.lm-status-ok { color:var(--dsw-alias-state-success-primary) }
.lm-status-err { color:var(--dsw-alias-state-error-primary) }

.lm-row { display:flex; justify-content:space-between; align-items:center; gap:12px; font-size:13px }
.lm-label { color:var(--dsw-alias-label-primary); font-weight:500 }
.lm-hint { color:var(--dsw-alias-label-secondary); font-size:12px; margin-top:2px }

.lm-btn { appearance:none; font:inherit; cursor:pointer; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:7px 14px; font-size:13px; font-weight:500; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); display:inline-flex; align-items:center; justify-content:center; gap:6px; text-decoration:none; transition:all .15s ease }
.lm-btn:hover:not(:disabled) { background:var(--dsw-alias-bg-layer-4, var(--dsw-alias-bg-layer-1)); border-color:var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2)) }
.lm-btn-primary { background:var(--dsw-alias-label-primary); color:var(--dsw-alias-bg-layer-3); border-color:transparent }
.lm-btn-primary:hover:not(:disabled) { background:var(--dsw-alias-label-primary) !important; color:var(--dsw-alias-bg-layer-3) !important; opacity:0.88; visibility:visible !important }
.lm-btn-danger { color:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-state-error-border, var(--dsw-alias-state-error-primary)); background:var(--dsw-alias-state-error-surface, transparent) }
.lm-btn-danger:hover:not(:disabled) { background:var(--dsw-alias-state-error-surface-hover, var(--dsw-alias-state-error-surface, transparent)) !important; border-color:var(--dsw-alias-state-error-primary) }
.lm-btn:disabled { opacity:0.5; cursor:not-allowed }

.lm-badge { font-size:12px; padding:3px 10px; border-radius:999px; border:1px solid var(--dsw-alias-border-l2); display:inline-flex; align-items:center; gap:5px; font-weight:500 }
.lm-badge-ok { border-color:var(--dsw-alias-state-success-primary); color:var(--dsw-alias-state-success-primary); background:var(--dsw-alias-state-success-surface, transparent) }
.lm-badge-warn { border-color:var(--dsw-alias-state-warning-primary); color:var(--dsw-alias-state-warning-primary); background:var(--dsw-alias-state-warning-surface, transparent) }
.lm-badge-bad { border-color:var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); background:var(--dsw-alias-state-error-surface, transparent) }

.lm-alert-ok { padding:10px 14px; border-radius:8px; background:var(--dsw-alias-state-success-surface, transparent); border:1px solid var(--dsw-alias-state-success-primary); color:var(--dsw-alias-state-success-primary); font-size:13px }
.lm-alert-bad { padding:10px 14px; border-radius:8px; background:var(--dsw-alias-state-error-surface, transparent); border:1px solid var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); font-size:13px }
.lm-banner-warning { padding:12px 16px; border-radius:8px; background:var(--dsw-alias-state-warning-surface, transparent); border:1px solid var(--dsw-alias-state-warning-primary); color:var(--dsw-alias-state-warning-primary); font-size:13px; display:flex; align-items:center; gap:10px; font-weight:500 }

.lm-qr-box { text-align:center; padding:14px; background:var(--dsw-alias-bg-layer-2); border-radius:10px; border:1px solid var(--dsw-alias-border-l2) }
.lm-qr-img { max-width:200px; height:auto; border-radius:8px; background:var(--dsw-alias-bg-layer-1, #ffffff); padding:6px }

.lm-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px }
@media(max-width:600px){ .lm-grid { grid-template-columns:1fr } }
.lm-field { display:flex; flex-direction:column; gap:4px }
.lm-field-full { grid-column:1 / -1 }
.lm-field-label { font-size:12px; font-weight:500; color:var(--dsw-alias-label-primary) }
.lm-input { height:36px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary); border-radius:8px; padding:0 12px; font-size:13px; width:100%; box-sizing:border-box }
.lm-input:focus { outline:none; border-color:var(--dsw-alias-state-brand-primary, var(--dsw-alias-label-primary)) }
.lm-select { height:36px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-3); border-radius:8px; padding:0 12px; color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; cursor:pointer; width:100%; box-sizing:border-box }
.lm-select:focus { outline:none; border-color:var(--dsw-alias-state-brand-primary, var(--dsw-alias-label-primary)) }
.lm-checkbox-label { display:inline-flex; align-items:center; gap:8px; font-size:13px; color:var(--dsw-alias-label-primary); cursor:pointer }

.lm-section-head { font-size:13px; font-weight:600; color:var(--dsw-alias-label-primary); border-bottom:1px solid var(--dsw-alias-border-l2); padding-bottom:6px; margin-top:10px; margin-bottom:4px; grid-column:1 / -1; display:flex; align-items:center; justify-content:space-between }
.lm-section-desc { font-size:11px; font-weight:400; color:var(--dsw-alias-label-secondary); margin-left:8px }

.lm-telemetry-bar { display:flex; gap:16px; padding:12px 16px; background:var(--dsw-alias-bg-layer-2); border-radius:10px; border:1px solid var(--dsw-alias-border-l2); font-size:12px; align-items:center; justify-content:space-around; flex-wrap:wrap }
.lm-telemetry-item { display:flex; flex-direction:column; align-items:center; gap:2px }
.lm-telemetry-val { font-size:14px; font-weight:600; color:var(--dsw-alias-label-primary) }
.lm-telemetry-lbl { font-size:11px; color:var(--dsw-alias-label-secondary) }

.lm-device-table { width:100%; border-collapse:collapse; font-size:12px; margin-top:8px }
.lm-device-table th { text-align:left; padding:8px 10px; border-bottom:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-secondary); font-weight:500 }
.lm-device-table td { padding:8px 10px; border-bottom:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary); vertical-align:middle }
.lm-device-row:last-child td { border-bottom:none }

.lm-pills { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; justify-content:center }
.lm-pill { padding:5px 12px; border-radius:16px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); font-size:12px; cursor:pointer; transition:all .15s ease }
.lm-pill:hover { border-color:var(--dsw-alias-label-primary); color:var(--dsw-alias-label-primary) }
.lm-pill-active { background:var(--dsw-alias-label-primary); color:var(--dsw-alias-bg-layer-3); border-color:var(--dsw-alias-label-primary); font-weight:600 }

/* #182: the QR action shares one footer row with settings */
[class$="_footArea"] { flex-direction:row; align-items:center; gap:4px }
[class$="_footArea"] [class$="_footerActions"],
[class$="_footArea"] [class$="_settingsArea"] { width:auto; flex:1 1 auto; min-width:0 }
`


    function ensureStyles() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-lanmode-styles')) return
      var style = document.createElement('style')
      style.id = 'dsh-lanmode-styles'
      style.setAttribute('data-dsh-plugin', 'dsh-lanmode')
      style.textContent = STYLES
      document.head.appendChild(style)
    }

    function createErrorBoundary() {
      if (!React || typeof React.Component !== 'function') {
        return function NoopBoundary(props) { return (props && props.children) || null }
      }
      return class ErrorBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { hasError: false, error: null }
        }
        static getDerivedStateFromError(error) {
          return { hasError: true, error: error }
        }
        componentDidCatch(error, errorInfo) {
          // eslint-disable-next-line no-console
          console.error('[dsh-lanmode] React Error in Settings Card:', error, errorInfo)
        }
        render() {
          if (this.state.hasError) {
            return React.createElement(
              'div',
              {
                className: 'lm-alert-bad',
                style: { margin: '12px 0', padding: '14px', borderRadius: '8px' },
              },
              React.createElement('div', { style: { fontWeight: 600, marginBottom: '6px' } }, translate('cardError')),
              React.createElement('div', { style: { fontSize: '12px', wordBreak: 'break-all' } }, String((this.state.error && this.state.error.message) || this.state.error)),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-btn',
                  style: { marginTop: '10px', fontSize: '12px', padding: '4px 10px' },
                  onClick: () => this.setState({ hasError: false, error: null }),
                },
                translate('retry'),
              ),
            )
          }
          return (this.props && this.props.children) || null
        }
      }
    }
    var ErrorBoundary = createErrorBoundary()

    function getNow() {
      try {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
          return performance.now()
        }
      } catch (err) { /* bestEffort */ void err }
      return Date.now()
    }

    function formatBytes(bytes) {
      if (!bytes || bytes < 0) return '0 B'
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    function resolveSnapshot(targetScope) {
      if (!targetScope) return { status: 'unavailable', value: null }
      if (typeof targetScope.getSnapshot === 'function') return targetScope.getSnapshot()
      return { status: 'unavailable', value: null }
    }
    env.ensureStyles = ensureStyles
    env.ErrorBoundary = ErrorBoundary
    env.getNow = getNow
    env.formatBytes = formatBytes
    env.resolveSnapshot = resolveSnapshot
  }
})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {});
