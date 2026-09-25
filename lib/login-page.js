function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Branded login page for DeepSeek Harness (Catppuccin Mocha / Dark UI).


/** Allowed ?notice= ids only — never render raw URL text (Issue #277). */
export const LOGIN_NOTICE_MESSAGES = Object.freeze({
  'password-changed': 'Your password was changed. Please sign in again.',
  'session-expired': 'Your session expired. Please sign in again.',
  'logged-out': 'You have been signed out.',
})

export function resolveLoginNotice(noticeId) {
  if (typeof noticeId !== 'string') return ''
  const key = noticeId.trim()
  return LOGIN_NOTICE_MESSAGES[key] || ''
}

export function renderLoginPage(options = {}) {
  const title = options.title || 'DeepSeek Harness'
  const subtitle = options.subtitle || 'Agent Management System Login'
  const version = options.version || '0.7.14'
  const isHttps = Boolean(options.https)
  const defaultUser = options.defaultUser || 'admin'
  const initialError = options.error || ''
  const publicHost = String(options.publicHost || '').trim()
  const noticeMsg = options.notice ? resolveLoginNotice(options.notice) : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="var(--dsw-alias-bg-layer-1, #11111b)">
  <title>${title} — Login</title>
  <link rel="icon" href="/favicon.ico">
  <style>
    :root {
      /* Issue #287: prefer DSH theme tokens, keep Catppuccin fallbacks */
      --bg-base: var(--dsw-alias-bg-layer-1, #11111b);
      --bg-mantle: var(--dsw-alias-bg-layer-2, #181825);
      --bg-surface: var(--dsw-alias-bg-surface, #1e1e2e);
      --bg-overlay: var(--dsw-alias-bg-overlay, #313244);
      --text-main: var(--dsw-alias-label-primary, #cdd6f4);
      --text-sub: var(--dsw-alias-label-secondary, #a6adc8);
      --text-dim: var(--dsw-alias-label-tertiary, #6c7086);
      --primary: var(--dsw-alias-state-brand-primary, #6366f1);
      --primary-hover: var(--dsw-alias-state-brand-primary-hover, #4f46e5);
      --primary-glow: color-mix(in srgb, var(--dsw-alias-state-brand-primary, #6366f1) 25%, transparent);
      --err-bg: color-mix(in srgb, var(--dsw-alias-state-danger, #f38ba8) 12%, transparent);
      --err-border: color-mix(in srgb, var(--dsw-alias-state-danger, #f38ba8) 35%, transparent);
      --err-text: var(--dsw-alias-state-danger, #f38ba8);
      --ok-text: var(--dsw-alias-state-success, #a6e3a1);
      --border-subtle: var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.08));
      --border-focus: color-mix(in srgb, var(--dsw-alias-state-brand-primary, #6366f1) 65%, transparent);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-base);
      background-image: 
        radial-gradient(circle at 50% 15%, rgba(99, 102, 241, 0.12) 0%, transparent 45%),
        radial-gradient(circle at 85% 85%, rgba(139, 92, 246, 0.08) 0%, transparent 40%);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .login-container {
      width: 100%;
      max-width: 420px;
    }
    .login-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 20px;
      padding: 36px 32px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(16px);
      position: relative;
    }
    .login-header {
      text-align: center;
      margin-bottom: 28px;
    }
    .logo-badge {
      width: 54px;
      height: 54px;
      margin: 0 auto 16px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 20px -4px var(--primary-glow);
      color: #fff;
    }
    .login-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }
    .instance-badge {
      margin-top: 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--border-subtle);
      background: rgba(99, 102, 241, 0.12);
      color: var(--text-sub);
      font-size: 12px;
    }
    .instance-badge strong { color: var(--text-main); font-weight: 600; }
    .login-subtitle {
      font-size: 13px;
      color: var(--text-sub);
    }
    .field-group {
      margin-bottom: 18px;
    }
    .field-label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-sub);
      margin-bottom: 8px;
    }
    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }
    .input-icon {
      position: absolute;
      left: 14px;
      color: var(--text-dim);
      pointer-events: none;
      display: flex;
    }
    .input-field {
      width: 100%;
      background: var(--bg-mantle);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 12px 14px 12px 42px;
      font-size: 14px;
      color: var(--text-main);
      outline: none;
      transition: all 0.2s ease;
    }
    .input-field:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px var(--primary-glow);
    }
    .toggle-pwd {
      position: absolute;
      right: 12px;
      background: none;
      border: none;
      color: var(--text-dim);
      cursor: pointer;
      padding: 4px;
      display: flex;
    }
    .toggle-pwd:hover { color: var(--text-main); }
    .remember-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      font-size: 13px;
    }
    .remember-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      color: var(--text-sub);
      user-select: none;
    }
    .remember-checkbox {
      accent-color: var(--primary);
      width: 16px;
      height: 16px;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn-submit {
      width: 100%;
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: #fff;
      border: none;
      border-radius: 12px;
      padding: 13px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 16px -2px var(--primary-glow);
      transition: all 0.2s ease;
    }
    .btn-submit:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 8px 24px -2px rgba(99, 102, 241, 0.4);
    }
    .btn-submit:active:not(:disabled) {
      transform: translateY(0);
    }
    .btn-submit:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
    .alert-notice {
      display: none;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      margin: 0 0 12px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--dsw-alias-state-brand-primary, #6366f1) 12%, transparent);
      color: var(--dsw-alias-label-primary, #111);
      font-size: 14px;
    }
    .alert-error {
      background: var(--err-bg);
      border: 1px solid var(--err-border);
      border-radius: 12px;
      padding: 11px 14px;
      color: var(--err-text);
      font-size: 13px;
      margin-bottom: 20px;
      display: ${initialError ? 'flex' : 'none'};
      align-items: center;
      gap: 10px;
      animation: fadeIn 0.2s ease;
    }
    .footer-bar {
      margin-top: 26px;
      padding-top: 18px;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-dim);
    }
    .sec-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: ${isHttps ? 'var(--ok-text)' : 'var(--text-dim)'};
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-6px); }
      40%, 80% { transform: translateX(6px); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .shake-anim { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-card" id="card">
      <div class="login-header">
        <div class="logo-badge">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h1 class="login-title">${escapeHtml(title)}</h1>
        <p class="login-subtitle">${escapeHtml(subtitle)}</p>
        ${publicHost ? `<div class="instance-badge" title="Confirmed instance host">Instance: <strong>${escapeHtml(publicHost)}</strong></div>` : ''}
      </div>

      <div class="alert-notice" id="notice-box" style="${noticeMsg ? 'display:flex' : 'display:none'}" role="status">
        <span id="notice-msg">${escapeHtml(noticeMsg)}</span>
      </div>
      <div class="alert-error" id="error-box">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span id="error-msg">${escapeHtml(initialError)}</span>
      </div>

      <form id="login-form" action="/dsh-lanmode/auth/login" method="POST">
        <div class="field-group">
          <label class="field-label" for="username">Username</label>
          <div class="input-wrapper">
            <span class="input-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </span>
            <input class="input-field" id="username" name="username" type="text" autocomplete="username" value="${escapeHtml(defaultUser)}" required autofocus>
          </div>
        </div>

        <div class="field-group">
          <label class="field-label" for="password">Password</label>
          <div class="input-wrapper">
            <span class="input-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </span>
            <input class="input-field" id="password" name="password" type="password" autocomplete="current-password" required placeholder="••••••••">
            <button type="button" class="toggle-pwd" id="btn-toggle-pwd" aria-label="Show password">
              <svg id="eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
        </div>

        <div class="remember-row">
          <label class="remember-label">
            <input class="remember-checkbox" type="checkbox" name="remember" id="remember" checked>
            <span>Remember for 30 days</span>
          </label>
        </div>

        <button class="btn-submit" type="submit" id="btn-submit">
          <span id="btn-text">Sign In</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </form>

      <div class="footer-bar">
        <span class="sec-badge">
          ${isHttps ? '🔒 HTTPS Secured' : '🌐 Direct Mode'}
        </span>
        <span>dsh-lanmode v${version}</span>
      </div>
    </div>
  </div>

  <script>
    (function () {
      var pwdInput = document.getElementById('password')
      var toggleBtn = document.getElementById('btn-toggle-pwd')
      var form = document.getElementById('login-form')
      var submitBtn = document.getElementById('btn-submit')
      var btnText = document.getElementById('btn-text')
      var errBox = document.getElementById('error-box')
      var errMsg = document.getElementById('error-msg')
      var noticeBox = document.getElementById('notice-box')
      var noticeMsg = document.getElementById('notice-msg')
      var NOTICE_MAP = {
        'password-changed': 'Your password was changed. Please sign in again.',
        'session-expired': 'Your session expired. Please sign in again.',
        'logged-out': 'You have been signed out.'
      }
      ;(function showAllowedNotice() {
        try {
          var raw = new URLSearchParams(window.location.search).get('notice')
          if (!raw || !NOTICE_MAP[raw]) return
          if (noticeMsg) noticeMsg.textContent = NOTICE_MAP[raw]
          if (noticeBox) noticeBox.style.display = 'flex'
        } catch (err) { /* bestEffort */ void err }
      })()
      var card = document.getElementById('card')

      toggleBtn.onclick = function () {
        if (pwdInput.type === 'password') {
          pwdInput.type = 'text'
          toggleBtn.style.color = '#cdd6f4'
        } else {
          pwdInput.type = 'password'
          toggleBtn.style.color = '#6c7086'
        }
      }

      function showError(text) {
        errMsg.textContent = text
        errBox.style.display = 'flex'
        card.classList.remove('shake-anim')
        void card.offsetWidth
        card.classList.add('shake-anim')
      }

      form.onsubmit = function (e) {
        e.preventDefault()
        var user = document.getElementById('username').value.trim()
        var pass = pwdInput.value
        var remember = document.getElementById('remember').checked

        if (!user || !pass) return

        submitBtn.disabled = true
        btnText.textContent = 'Authenticating...'
        errBox.style.display = 'none'

        fetch('/dsh-lanmode/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: user, password: pass, remember: remember }),
        }).then(function (res) {
          if (res.ok) {
            btnText.textContent = 'Success!'
            submitBtn.style.background = '#22c55e'
            setTimeout(function () {
              var returnTo = new URLSearchParams(window.location.search).get('return') || '/'
              window.location.href = returnTo
            }, 300)
          } else if (res.status === 429) {
            res.json().then(function (data) {
              var retry = data.retryAfter || 30
              showError('Too many attempts. Please wait ' + retry + ' sec.')
            }).catch(function () {
              showError('Too many attempts. Please wait 30 sec.')
            })
            submitBtn.disabled = false
            btnText.textContent = 'Sign In'
          } else {
            showError('Invalid username or password')
            submitBtn.disabled = false
            btnText.textContent = 'Sign In'
            pwdInput.value = ''
            pwdInput.focus()
          }
        }).catch(function (err) {
          showError('Network error: ' + (err.message || 'server not responding'))
          submitBtn.disabled = false
          btnText.textContent = 'Sign In'
        })
      }
    })()
  </script>
</body>
</html>`
}
