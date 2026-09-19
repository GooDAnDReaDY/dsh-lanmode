// dsh-lanmode — Client side bundle.
//
// 1. Settings card in Settings -> Plugins -> Plugin Settings (slot: settings.plugin.item).
// 2. Background notifications (Web Notifications API) on turn/end generation while tab is hidden.
// 3. Quick mobile connection drawer, multi-interface QR code, iOS profile & CA download.
// 4. Zero hardcoded Cyrillic: canonical English (en) with bundled Chinese (zh) localization.

window.__ModuleLoader__.load({
  id: '@goodandready/dsh-lanmode',
  factory: function (require) {
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

    var I18N = {
      en: {
        title: 'LAN Access & Mobile Gateway (dsh-lanmode)',
        sub: 'mDNS (dsh.local), Web API polyfills, TLS for microphone & PWA',
        quickConnect: 'Quick Smartphone & Tablet Connection',
        openQr: 'Open QR Code',
        copyUrl: 'Copy URL',
        copied: 'Copied ✔',
        desktopMode: 'Force desktop layout',
        desktopModeSub: 'Disables mobile UI adaptations',
        notifStatus: 'Turn completion notifications',
        notifEnable: 'Enable notifications',
        notifGranted: 'Enabled ✔',
        notifDenied: 'Blocked in browser',
        telemetryTitle: 'Live Network Telemetry',
        telemetryRtt: 'RTT Latency',
        telemetryConns: 'Active Connections',
        telemetrySent: 'Bytes Sent',
        telemetryRecv: 'Bytes Received',
        devicesTitle: 'Connected Devices & Active Sessions',
        devicesSub: 'Active network sessions authenticated via LAN or Cloudflare Tunnel',
        devicesIp: 'IP Address',
        devicesUa: 'Device / Client',
        devicesLastSeen: 'Last Active',
        devicesActions: 'Actions',
        deviceCurrent: 'This device',
        deviceRevoke: 'Revoke',
        deviceRevokeAllOthers: 'Revoke All Other Sessions',
        deviceRevokeConfirm: 'Revoke session for this device?',
        deviceRevokeAllConfirm: 'Revoke all sessions except the current one?',
        deviceNoDevices: 'No connected devices registered yet',
        deviceSetNickname: 'Set nickname',
        deviceNicknamePrompt: 'Enter device nickname:',
        devicePlatformIos: 'iOS',
        devicePlatformAndroid: 'Android',
        devicePlatformMacos: 'macOS',
        devicePlatformWindows: 'Windows',
        devicePlatformLinux: 'Linux',
        secRouting: 'Network Listener & Routing',
        secRoutingDesc: 'Port binding, timeouts, and privileged endpoint routing',
        modeLabel: 'Operating mode (mode)',
        modeAuto: 'auto (auto-detect proxy or direct listener)',
        modeDirect: 'direct (open dedicated port on host)',
        modeProxy: 'proxy (behind nginx or reverse proxy)',
        directPortLabel: 'Direct listener port (directPort)',
        streamTimeoutLabel: 'Request streaming timeout in ms (streamTimeoutMs)',
        streamTimeoutPh: '0 (unlimited)',
        privilegedExtraLabel: 'Additional privileged URL paths',
        privilegedExtraPh: '/api/custom-admin, /internal/*',
        secTls: 'TLS Encryption & HTTPS (Microphone / Certificates)',
        secTlsDesc: 'Secures LAN connections for Web Speech API and PWA',
        tlsModeLabel: 'TLS mode (tls)',
        tlsSelfSigned: 'self-signed (auto-issued Root CA + server cert)',
        tlsFiles: 'files (custom PEM certificate and key)',
        tlsOff: 'off (disabled / plain HTTP without microphone)',
        tlsHostsLabel: 'Additional SAN names and IPs for certificate',
        tlsHostsPh: 'my-server.lan, 192.168.1.50',
        tlsCertLabel: 'PEM Certificate path (tlsCert)',
        tlsKeyLabel: 'PEM Private key path (tlsKey)',
        secAccess: 'LAN Access Control & Subnet Roles',
        secAccessDesc: 'IP filters, admin/guest roles, and LAN PIN protection',
        lanPinRefLabel: 'LAN PIN secret reference (lanPinRef)',
        lanPinRefPh: 'DSH_LAN_PIN or secret name in credentials',
        allowLabel: 'Allowed IP subnets (allow)',
        allowPh: '192.168.1.0/24, 127.0.0.1 (empty = all)',
        adminAllowLabel: 'Admin role subnets (adminAllow)',
        adminAllowPh: '192.168.1.100, 10.0.0.0/24 (settings & plugins)',
        guestAllowLabel: 'Guest role subnets (guestAllow)',
        guestAllowPh: '192.168.2.0/24 (chat only, settings blocked)',
        unlockPrivilegedLabel: 'Allow privileged calls (settings, keys) from LAN',
        secMobile: 'Mobile Interface, mDNS & PWA',
        secMobileDesc: 'Local discovery, mobile gestures, and offline web app',
        mdnsNameLabel: 'mDNS domain name (mdnsName)',
        mdnsNamePh: 'dsh.local (must end in .local)',
        mdnsAnnounceLabel: 'Announce domain via mDNS (Zeroconf / Bonjour)',
        pwaLabel: 'Inject PWA Manifest and mobile viewport meta tags',
        mobileEnterLabel: 'Enter key sends message on touch keyboards',
        diagnosticsLabel: 'Enable diagnostic endpoints (/dsh-lanmode/health, /probe)',
        secPolyfills: 'Browser Web API Polyfills (HTTP Shims)',
        secPolyfillsDesc: 'Restores browser APIs restricted on insecure origins',
        unblockSettingsLabel: 'Unblock loopback settings restriction',
        randomUuidLabel: 'crypto.randomUUID polyfill on plain HTTP',
        clipboardLabel: 'navigator.clipboard.writeText fallback on plain HTTP',
        secAuth: 'Authentication & Login Protection',
        secAuthDesc: 'Protects DSH with login/password for multi-user networks',
        passwordAuthLabel: 'Require login and password authentication',
        authUserLabel: 'Admin username (authUser)',
        authSessionDaysLabel: 'Remember session duration in days (authSessionDays)',
        authPasswordLabel: 'Password (authPassword)',
        authPasswordPh: 'Login password',
        authPasswordRefLabel: 'Password secret reference (authPasswordRef)',
        authPasswordRefPh: 'DSH_AUTH_PASSWORD or secret name in credentials',
        secTunnel: 'Remote Access (Cloudflare Tunnel)',
        secTunnelDesc: 'Secure WAN access without public IP or port forwarding',
        tunnelModeLabel: 'Tunnel mode (tunnel)',
        tunnelOff: 'off (disabled)',
        tunnelQuick: 'quick (instant trycloudflare.com)',
        tunnelNamed: 'named (persistent tunnel with token)',
        tunnelTokenRefLabel: 'Tunnel token secret reference (tunnelTokenRef)',
        tunnelTokenRefPh: 'CF_TUNNEL_TOKEN or secret name in credentials',
        tunnelPinLabel: 'Require LAN PIN for requests via Cloudflare WAN tunnel',
        saveSettings: 'Save Settings',
        saving: 'Saving...',
        saveSuccess: 'Settings saved successfully ✔',
        saveError: 'Error saving settings: ',
        logout: 'Log Out',
        logoutConfirm: 'Are you sure you want to log out of DSH?',
        healthLink: 'Open diagnostic page (/dsh-lanmode/health) →',
        quickQrTitle: '📱 Mobile Smartphone Login',
        downloadProfile: 'iOS Profile (.mobileconfig)',
        downloadCa: 'Root CA (.crt)',
        shareUrl: 'Share ↗',
        interfacesLabel: 'Network Interface:',
        rttLabel: 'Ping',
        ms: 'ms',
        activeMdns: 'active',
        phoneConnected: '📱 Mobile Ready',
        turnEndNotification: 'Agent completed response',
        approvalNotification: 'Confirmation required',
        toolPrefix: 'Tool: ',
        retry: 'Retry',
        cardError: '⚠️ LanMode Card Error:',
        settingsUnavailable: 'Settings service is unavailable or not ready',
        updaterTitle: 'Plugin Updates',
        updaterDesc: 'Check and update @goodandready/dsh-lanmode to the latest release',
        updaterCurrentVersion: 'Current version:',
        updaterLatestVersion: 'Latest version:',
        updaterUpToDate: 'Up to date ✔',
        updaterUpdateAvailable: 'Update available!',
        updaterCheckBtn: 'Check for Updates',
        updaterChecking: 'Checking...',
        updaterUpdateBtn: 'Update Now',
        updaterUpdating: 'Updating...',
        updaterSuccess: 'Updated successfully! Please restart DSH to apply.',
        updaterError: 'Update check/installation failed: ',
        updaterRestartNote: 'Restart dsh-web (or DSH host process) to activate.',
      },
      zh: {
        title: '局域网访问与移动端网关 (dsh-lanmode)',
        sub: 'mDNS (dsh.local)、Web API Polyfill、麦克风 TLS 与 PWA',
        quickConnect: '手机与平板快速连接',
        openQr: '打开二维码',
        copyUrl: '复制链接',
        copied: '已复制 ✔',
        desktopMode: '强制桌面布局',
        desktopModeSub: '禁用移动端自适应布局',
        notifStatus: '生成完成后台通知',
        notifEnable: '启用通知',
        notifGranted: '已启用 ✔',
        notifDenied: '浏览器已拒绝',
        telemetryTitle: '实时网络遥测',
        telemetryRtt: '往返延迟 (RTT)',
        telemetryConns: '活跃连接数',
        telemetrySent: '发送字节数',
        telemetryRecv: '接收字节数',
        devicesTitle: '已连接设备与活跃会话',
        devicesSub: '通过局域网或 Cloudflare 隧道认证的活跃会话',
        devicesIp: 'IP 地址',
        devicesUa: '设备 / 客户端',
        devicesLastSeen: '最后活跃',
        devicesActions: '操作',
        deviceCurrent: '当前设备',
        deviceRevoke: '注销',
        deviceRevokeAllOthers: '注销其他所有设备',
        deviceRevokeConfirm: '确定注销该设备的访问会话吗？',
        deviceRevokeAllConfirm: '确定注销除当前设备外的所有其他会话吗？',
        deviceNoDevices: '暂无已连接设备',
        deviceSetNickname: '设置备注名',
        deviceNicknamePrompt: '请输入设备备注名：',
        devicePlatformIos: 'iOS',
        devicePlatformAndroid: 'Android',
        devicePlatformMacos: 'macOS',
        devicePlatformWindows: 'Windows',
        devicePlatformLinux: 'Linux',
        secRouting: '网络监听与路由',
        secRoutingDesc: '端口绑定、超时时间及特权端点路由',
        modeLabel: '工作模式 (mode)',
        modeAuto: 'auto (自动检测反向代理或直接监听)',
        modeDirect: 'direct (在主机开放专用端口)',
        modeProxy: 'proxy (部署在 nginx 等反向代理之后)',
        directPortLabel: '直接监听端口 (directPort)',
        streamTimeoutLabel: '流式请求超时时间/毫秒 (streamTimeoutMs)',
        streamTimeoutPh: '0 (无限制)',
        privilegedExtraLabel: '附加特权 URL 路径',
        privilegedExtraPh: '/api/custom-admin, /internal/*',
        secTls: 'TLS 加密与 HTTPS (麦克风 / 证书)',
        secTlsDesc: '为局域网提供安全连接以支持 Web 麦克风与 PWA',
        tlsModeLabel: 'TLS 模式 (tls)',
        tlsSelfSigned: 'self-signed (自动签发根证书与服务证书)',
        tlsFiles: 'files (使用自定义 PEM 证书和密钥文件)',
        tlsOff: 'off (已禁用 / 普通 HTTP 无麦克风支持)',
        tlsHostsLabel: '证书附加域名及 IP (SAN)',
        tlsHostsPh: 'my-server.lan, 192.168.1.50',
        tlsCertLabel: 'PEM 证书文件路径 (tlsCert)',
        tlsKeyLabel: 'PEM 私钥文件路径 (tlsKey)',
        secAccess: '局域网访问控制与子网角色',
        secAccessDesc: 'IP 子网过滤、管理员/访客角色分离及 LAN PIN',
        lanPinRefLabel: 'LAN PIN 凭证引用 (lanPinRef)',
        lanPinRefPh: 'DSH_LAN_PIN 或 credentials 凭证名',
        allowLabel: '允许访问的 IP 子网 (allow)',
        allowPh: '192.168.1.0/24, 127.0.0.1 (留空表示允许全部)',
        adminAllowLabel: '管理员子网列表 (adminAllow)',
        adminAllowPh: '192.168.1.100, 10.0.0.0/24 (可改设置与管理插件)',
        guestAllowLabel: '访客子网列表 (guestAllow)',
        guestAllowPh: '192.168.2.0/24 (仅允许对话，禁止设置)',
        unlockPrivilegedLabel: '允许来自局域网的特权调用 (设置、密钥)',
        secMobile: '移动端界面、mDNS 与 PWA',
        secMobileDesc: '本地网络发现、移动端手势与渐进式应用',
        mdnsNameLabel: 'mDNS 域名 (mdnsName)',
        mdnsNamePh: 'dsh.local (必须以 .local 结尾)',
        mdnsAnnounceLabel: '通过 mDNS (Zeroconf / Bonjour) 广播域名',
        pwaLabel: '注入 PWA Manifest 和移动端 viewport 标签',
        mobileEnterLabel: '移动触摸键盘上回车键直接发送消息',
        diagnosticsLabel: '启用诊断端点 (/dsh-lanmode/health, /probe)',
        secPolyfills: '浏览器 Web API Polyfill (HTTP Shims)',
        secPolyfillsDesc: '在非 localhost 环境下恢复浏览器安全 API',
        unblockSettingsLabel: '解除设置面板的 loopback 限制',
        randomUuidLabel: '普通 HTTP 下提供 crypto.randomUUID',
        clipboardLabel: '普通 HTTP 下回退 navigator.clipboard.writeText',
        secAuth: '身份认证与登录保护',
        secAuthDesc: '通过用户名和密码保护多用户局域网环境',
        passwordAuthLabel: '强制要求用户名和密码登录',
        authUserLabel: '管理员用户名 (authUser)',
        authSessionDaysLabel: '记住会话有效天数 (authSessionDays)',
        authPasswordLabel: '密码 (authPassword)',
        authPasswordPh: '登录密码',
        authPasswordRefLabel: '密码凭证引用 (authPasswordRef)',
        authPasswordRefPh: 'DSH_AUTH_PASSWORD 或 credentials 凭证名',
        secTunnel: '远程访问 (Cloudflare Tunnel)',
        secTunnelDesc: '无需公网 IP 和端口映射实现安全远程访问',
        tunnelModeLabel: '隧道模式 (tunnel)',
        tunnelOff: 'off (已禁用)',
        tunnelQuick: 'quick (快速公开 trycloudflare.com)',
        tunnelNamed: 'named (基于 Token 的固定隧道)',
        tunnelTokenRefLabel: '隧道 Token 凭证引用 (tunnelTokenRef)',
        tunnelTokenRefPh: 'CF_TUNNEL_TOKEN 或 credentials 凭证名',
        tunnelPinLabel: '通过 Cloudflare 隧道访问时强制要求 LAN PIN',
        saveSettings: '保存设置',
        saving: '保存中...',
        saveSuccess: '设置已成功保存 ✔',
        saveError: '保存设置失败: ',
        logout: '退出登录',
        logoutConfirm: '确定要退出当前 DSH 登录会话吗？',
        healthLink: '查看完整诊断页面 (/dsh-lanmode/health) →',
        quickQrTitle: '📱 手机端快速登录',
        downloadProfile: 'iOS 配置文件 (.mobileconfig)',
        downloadCa: '根证书 (.crt)',
        shareUrl: '系统分享 ↗',
        interfacesLabel: '网络接口:',
        rttLabel: '延迟',
        ms: '毫秒',
        activeMdns: '正常',
        phoneConnected: '📱 手机端已连接',
        turnEndNotification: '智能体已完成回复',
        approvalNotification: '需要用户确认操作',
        toolPrefix: '工具: ',
        retry: '重试',
        cardError: '⚠️ LanMode 卡片渲染错误:',
        settingsUnavailable: '设置服务不可用或未就绪',
        updaterTitle: '插件更新',
        updaterDesc: '检查并更新 @goodandready/dsh-lanmode 插件至最新版本',
        updaterCurrentVersion: '当前版本:',
        updaterLatestVersion: '最新版本:',
        updaterUpToDate: '已是最新版本 ✔',
        updaterUpdateAvailable: '发现新版本!',
        updaterCheckBtn: '检查更新',
        updaterChecking: '检查中...',
        updaterUpdateBtn: '立即更新',
        updaterUpdating: '更新中...',
        updaterSuccess: '更新成功！请重启 DSH 服务以生效。',
        updaterError: '更新或检查失败: ',
        updaterRestartNote: '重启 dsh-web（或 DSH 主进程）以激活更新。',
      },
    }

    function getLocale() {
      try {
        if (typeof window !== 'undefined' && window.__DSH_LOCALE__) return window.__DSH_LOCALE__
        var navLang = (typeof navigator !== 'undefined' && (navigator.language || '')).toLowerCase()
        if (navLang.startsWith('zh')) return 'zh'
        if (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) {
          if (document.documentElement.lang.toLowerCase().startsWith('zh')) return 'zh'
        }
      } catch (err) { /* bestEffort */ void err }
      return 'en'
    }

    function translate(key) {
      var loc = getLocale()
      var dict = I18N[loc] || I18N.en
      return dict[key] || I18N.en[key] || key
    }

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

    function LanModeCard(props) {
      ensureStyles()
      var t = props.t || translate
      var ctx = props.ctx

      var _open = useState(false)
      var open = _open[0]
      var setOpen = _open[1]

      var _showQr = useState(false)
      var showQr = _showQr[0]
      var setShowQr = _showQr[1]

      var _notifPerm = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
      var notifPerm = _notifPerm[0]
      var setNotifPerm = _notifPerm[1]

      var _copied = useState(false)
      var copied = _copied[0]
      var setCopied = _copied[1]

      var copyLanUrl = useCallback(function () {
        var url = (typeof window !== 'undefined' && window.location && window.location.href) ? window.location.href : ''
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {
            setCopied(true)
            setTimeout(function () { setCopied(false) }, 2000)
          }).catch(function () {})
        }
      }, [])

      var _forceDesktop = useState(function () {
        try { return sessionStorage.getItem('dsh_force_desktop') === '1' } catch (_) { return false }
      })
      var forceDesktop = _forceDesktop[0]
      var setForceDesktop = _forceDesktop[1]

      var isSecure = typeof window !== 'undefined' && window.isSecureContext === true

      var toggleForceDesktop = useCallback(function () {
        var next = !forceDesktop
        setForceDesktop(next)
        try {
          if (next) sessionStorage.setItem('dsh_force_desktop', '1')
          else sessionStorage.removeItem('dsh_force_desktop')
          window.location.reload()
        } catch (err) { /* bestEffort */ void err }
      }, [forceDesktop])

      var requestNotify = useCallback(function () {
        if (typeof Notification === 'undefined') return
        Notification.requestPermission().then(function (perm) {
          setNotifPerm(perm)
        })
      }, [])

      // Feature 1: Connected Devices & Session Management
      var _devices = useState([])
      var devices = _devices[0]
      var setDevices = _devices[1]

      var refreshDevices = useCallback(function () {
        fetch('/dsh-lanmode/devices', { cache: 'no-store' })
          .then(function (r) { return r.json() })
          .then(function (list) { if (Array.isArray(list)) setDevices(list) })
          .catch(function () {})
      }, [])

      useEffect(function () {
        if (!open) return
        refreshDevices()
        var iv = setInterval(refreshDevices, 20000)
        return function () { clearInterval(iv) }
      }, [open, refreshDevices])

      var revokeDevice = useCallback(function (id) {
        if (!window.confirm(translate('deviceRevokeConfirm'))) return
        fetch('/dsh-lanmode/devices/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: id }),
        }).then(function () { refreshDevices() })
      }, [refreshDevices])

      var killAllDevices = useCallback(function () {
        if (!window.confirm(translate('deviceRevokeAllConfirm'))) return
        fetch('/dsh-lanmode/devices/kill-all', { method: 'POST' }).then(function () { refreshDevices() })
      }, [refreshDevices])

      var setDeviceNickname = useCallback(function (id, currentNick) {
        var next = window.prompt(translate('deviceNicknamePrompt'), currentNick || '')
        if (next === null) return
        fetch('/dsh-lanmode/devices/nickname', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: id, nickname: next.trim() }),
        }).then(function () { refreshDevices() })
      }, [refreshDevices])

      // Feature 5: Live Network Telemetry
      var _telemetry = useState({ activeConnections: 0, totalBytesSent: 0, totalBytesReceived: 0, rtt: null })
      var telemetry = _telemetry[0]
      var setTelemetry = _telemetry[1]

      var refreshTelemetry = useCallback(function () {
        var t0 = getNow()
        fetch('/dsh-lanmode/api/telemetry', { cache: 'no-store' })
          .then(function (r) { return r.json() })
          .then(function (data) {
            var rtt = Math.round(getNow() - t0)
            setTelemetry({
              activeConnections: data.activeConnections || 0,
              totalBytesSent: data.totalBytesSent || 0,
              totalBytesReceived: data.totalBytesReceived || 0,
              rtt: rtt,
            })
          })
          .catch(function () {})
      }, [])

      useEffect(function () {
        if (!open) return
        refreshTelemetry()
        var iv = setInterval(refreshTelemetry, 5000)
        return function () { clearInterval(iv) }
      }, [open, refreshTelemetry])

      // Cloudflare Tunnel
      var _tunnel = useState({ active: false, publicUrl: null, status: 'stopped' })
      var tunnel = _tunnel[0]
      var setTunnel = _tunnel[1]

      var refreshTunnel = useCallback(function () {
        fetch('/dsh-lanmode/tunnel', { cache: 'no-store' })
          .then(function (r) { return r.json() })
          .then(function (t) { if (t) setTunnel(t) })
          .catch(function () {})
      }, [])

      useEffect(function () {
        if (!open) return
        refreshTunnel()
        var iv = setInterval(refreshTunnel, 10000)
        return function () { clearInterval(iv) }
      }, [open, refreshTunnel])

      var toggleTunnel = useCallback(function () {
        var next = !tunnel.active
        fetch('/dsh-lanmode/tunnel/toggle', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: next }),
        })
          .then(function (r) { return r.json() })
          .then(function (t) { if (t) setTunnel(t) })
          .catch(function () {})
      }, [tunnel.active])

      // Feature: Plugin Updater (#134)
      var _updater = useState(null)
      var updater = _updater[0]
      var setUpdater = _updater[1]

      var _updaterBusy = useState(false)
      var updaterBusy = _updaterBusy[0]
      var setUpdaterBusy = _updaterBusy[1]

      var _updaterMsg = useState('')
      var updaterMsg = _updaterMsg[0]
      var setUpdaterMsg = _updaterMsg[1]

      var _updaterErr = useState('')
      var updaterErr = _updaterErr[0]
      var setUpdaterErr = _updaterErr[1]

      var loadUpdaterStatus = useCallback(function () {
        fetch('/api/dsh-lanmode/update')
          .then(function (r) { return r.json() })
          .then(function (d) { if (d && d.name) setUpdater(d) })
          .catch(function () {})
      }, [])

      useEffect(function () {
        if (!open) return
        loadUpdaterStatus()
      }, [open, loadUpdaterStatus])

      var handleCheckUpdate = useCallback(function () {
        setUpdaterBusy(true)
        setUpdaterMsg('')
        setUpdaterErr('')
        fetch('/api/dsh-lanmode/update', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-dsh-plugin-update': '1',
          },
          body: JSON.stringify({ action: 'check' }),
        })
          .then(function (r) { return r.json() })
          .then(function (res) {
            setUpdaterBusy(false)
            if (res && res.error) {
              setUpdaterErr(translate('updaterError') + res.error)
            } else if (res) {
              setUpdater(res)
              if (res.updateAvailable) {
                setUpdaterMsg(translate('updaterUpdateAvailable') + ' (' + (res.latestVersion || '') + ')')
              } else {
                setUpdaterMsg(translate('updaterUpToDate'))
              }
            }
          })
          .catch(function (err) {
            setUpdaterBusy(false)
            setUpdaterErr(translate('updaterError') + ((err && err.message) || String(err)))
          })
      }, [])

      var handlePerformUpdate = useCallback(function () {
        setUpdaterBusy(true)
        setUpdaterMsg('')
        setUpdaterErr('')
        fetch('/api/dsh-lanmode/update', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-dsh-plugin-update': '1',
          },
          body: JSON.stringify({ action: 'update' }),
        })
          .then(function (r) { return r.json() })
          .then(function (res) {
            setUpdaterBusy(false)
            if (res && res.error) {
              setUpdaterErr(translate('updaterError') + res.error)
            } else if (res && res.success) {
              setUpdaterMsg(translate('updaterSuccess'))
              loadUpdaterStatus()
            } else {
              setUpdaterErr(translate('updaterError') + ((res && res.message) || 'Unknown error'))
            }
          })
          .catch(function (err) {
            setUpdaterBusy(false)
            setUpdaterErr(translate('updaterError') + ((err && err.message) || String(err)))
          })
      }, [loadUpdaterStatus])

      var scope = useMemo(function () {
        var svc = (ctx && typeof ctx.get === 'function' ? ctx.get('settingsScope') : null) || (ctx && ctx.settingsScope)
        return (svc && typeof svc.bind === 'function') ? svc.bind({ namespace: NS }) : null
      }, [ctx])

      var _snap = useState(function () {
        return resolveSnapshot(scope)
      })
      var snapshot = _snap[0]
      var setSnapshot = _snap[1]

      useEffect(function () {
        if (!scope || typeof scope.subscribe !== 'function') {
          setSnapshot(resolveSnapshot(scope))
          return
        }
        var update = function () {
          setSnapshot(resolveSnapshot(scope))
        }
        update()
        return scope.subscribe(update)
      }, [scope])

      var snapStatus = (snapshot && snapshot.status) || 'loading'
      var storedConfig = (snapshot && snapshot.value) || {}

      var _draft = useState(null)
      var draft = _draft[0]
      var setDraft = _draft[1]

      var _saving = useState(false)
      var saving = _saving[0]
      var setSaving = _saving[1]

      var _saveMsg = useState('')
      var saveMsg = _saveMsg[0]
      var setSaveMsg = _saveMsg[1]

      var _saveErr = useState('')
      var saveErr = _saveErr[0]
      var setSaveErr = _saveErr[1]

      var handleLogout = useCallback(function () {
        if (!window.confirm(translate('logoutConfirm'))) return
        fetch('/dsh-lanmode/auth/logout', { method: 'POST' })
          .then(function () { window.location.href = '/' })
          .catch(function () { window.location.href = '/' })
      }, [])

      useEffect(function () {
        if (snapStatus === 'ready' && draft === null) {
          setDraft({
            mode: storedConfig.mode || 'auto',
            directPort: storedConfig.directPort !== undefined ? String(storedConfig.directPort) : '3088',
            tls: storedConfig.tls || 'self-signed',
            tlsHosts: Array.isArray(storedConfig.tlsHosts) ? storedConfig.tlsHosts.join(', ') : '',
            tlsCert: storedConfig.tlsCert || '',
            tlsKey: storedConfig.tlsKey || '',
            allow: Array.isArray(storedConfig.allow) ? storedConfig.allow.join(', ') : '',
            adminAllow: Array.isArray(storedConfig.adminAllow) ? storedConfig.adminAllow.join(', ') : '',
            guestAllow: Array.isArray(storedConfig.guestAllow) ? storedConfig.guestAllow.join(', ') : '',
            unlockPrivileged: storedConfig.unlockPrivileged !== false,
            lanPinRef: storedConfig.lanPinRef || '',
            privilegedExtra: Array.isArray(storedConfig.privilegedExtra) ? storedConfig.privilegedExtra.join(', ') : '',
            streamTimeoutMs: storedConfig.streamTimeoutMs !== undefined ? String(storedConfig.streamTimeoutMs) : '0',

            mdns: storedConfig.mdns !== false,
            mdnsName: storedConfig.mdnsName || 'dsh.local',
            pwa: storedConfig.pwa !== false,
            mobileEnterSends: Boolean(storedConfig.mobileEnterSends),
            diagnostics: storedConfig.diagnostics !== false,

            settings: storedConfig.settings !== false,
            randomUuid: storedConfig.randomUuid !== false,
            clipboard: storedConfig.clipboard !== false,

            passwordAuth: Boolean(storedConfig.passwordAuth),
            authUser: storedConfig.authUser !== undefined ? storedConfig.authUser : 'admin',
            authPassword: storedConfig.authPassword !== undefined ? storedConfig.authPassword : '',
            authPasswordRef: storedConfig.authPasswordRef || '',
            authSessionDays: storedConfig.authSessionDays !== undefined ? String(storedConfig.authSessionDays) : '30',

            tunnel: storedConfig.tunnel || 'off',
            tunnelTokenRef: storedConfig.tunnelTokenRef || '',
            tunnelPin: storedConfig.tunnelPin !== false,
          })
        }
      }, [snapStatus, storedConfig, draft])

      var saveSettings = useCallback(function () {
        if (!scope || !draft || snapStatus === 'unavailable') return
        setSaving(true)
        setSaveMsg('')
        setSaveErr('')

        var broken = []
        var ops = []

        ops.push(Promise.resolve().then(function () {
          return scope.set('mode', draft.mode)
        }).catch(function (e) { broken.push('mode: ' + ((e && e.message) || e)) }))

        var p = parseInt(draft.directPort, 10)
        ops.push(Promise.resolve().then(function () {
          return scope.set('directPort', isNaN(p) ? 3088 : p)
        }).catch(function (e) { broken.push('directPort: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('tls', draft.tls)
        }).catch(function (e) { broken.push('tls: ' + ((e && e.message) || e)) }))

        var parseList = function (s) {
          return (s || '').split(',').map(function (x) { return x.trim() }).filter(Boolean)
        }

        ops.push(Promise.resolve().then(function () {
          return scope.set('tlsHosts', parseList(draft.tlsHosts))
        }).catch(function (e) { broken.push('tlsHosts: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('tlsCert', String(draft.tlsCert || '').trim())
        }).catch(function (e) { broken.push('tlsCert: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('tlsKey', String(draft.tlsKey || '').trim())
        }).catch(function (e) { broken.push('tlsKey: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('allow', parseList(draft.allow))
        }).catch(function (e) { broken.push('allow: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('adminAllow', parseList(draft.adminAllow))
        }).catch(function (e) { broken.push('adminAllow: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('guestAllow', parseList(draft.guestAllow))
        }).catch(function (e) { broken.push('guestAllow: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('unlockPrivileged', Boolean(draft.unlockPrivileged))
        }).catch(function (e) { broken.push('unlockPrivileged: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('lanPinRef', String(draft.lanPinRef || '').trim())
        }).catch(function (e) { broken.push('lanPinRef: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('privilegedExtra', parseList(draft.privilegedExtra))
        }).catch(function (e) { broken.push('privilegedExtra: ' + ((e && e.message) || e)) }))

        var st = parseInt(draft.streamTimeoutMs, 10)
        ops.push(Promise.resolve().then(function () {
          return scope.set('streamTimeoutMs', isNaN(st) || st < 0 ? 0 : st)
        }).catch(function (e) { broken.push('streamTimeoutMs: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('mdns', Boolean(draft.mdns))
        }).catch(function (e) { broken.push('mdns: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('mdnsName', String(draft.mdnsName || 'dsh.local').trim())
        }).catch(function (e) { broken.push('mdnsName: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('pwa', Boolean(draft.pwa))
        }).catch(function (e) { broken.push('pwa: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('mobileEnterSends', Boolean(draft.mobileEnterSends))
        }).catch(function (e) { broken.push('mobileEnterSends: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('diagnostics', Boolean(draft.diagnostics))
        }).catch(function (e) { broken.push('diagnostics: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('settings', Boolean(draft.settings))
        }).catch(function (e) { broken.push('settings: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('randomUuid', Boolean(draft.randomUuid))
        }).catch(function (e) { broken.push('randomUuid: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('clipboard', Boolean(draft.clipboard))
        }).catch(function (e) { broken.push('clipboard: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('passwordAuth', Boolean(draft.passwordAuth))
        }).catch(function (e) { broken.push('passwordAuth: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('authUser', String(draft.authUser || 'admin').trim())
        }).catch(function (e) { broken.push('authUser: ' + ((e && e.message) || e)) }))

        if (draft.authPassword !== undefined) {
          ops.push(Promise.resolve().then(function () {
            return scope.set('authPassword', String(draft.authPassword))
          }).catch(function (e) { broken.push('authPassword: ' + ((e && e.message) || e)) }))
        }

        if (draft.authPasswordRef !== undefined) {
          ops.push(Promise.resolve().then(function () {
            return scope.set('authPasswordRef', String(draft.authPasswordRef).trim())
          }).catch(function (e) { broken.push('authPasswordRef: ' + ((e && e.message) || e)) }))
        }

        var sessDays = parseInt(draft.authSessionDays, 10)
        ops.push(Promise.resolve().then(function () {
          return scope.set('authSessionDays', isNaN(sessDays) || sessDays < 1 ? 30 : sessDays)
        }).catch(function (e) { broken.push('authSessionDays: ' + ((e && e.message) || e)) }))

        ops.push(Promise.resolve().then(function () {
          return scope.set('tunnel', draft.tunnel)
        }).catch(function (e) { broken.push('tunnel: ' + ((e && e.message) || e)) }))

        if (draft.tunnelTokenRef !== undefined) {
          ops.push(Promise.resolve().then(function () {
            return scope.set('tunnelTokenRef', String(draft.tunnelTokenRef).trim())
          }).catch(function (e) { broken.push('tunnelTokenRef: ' + ((e && e.message) || e)) }))
        }

        ops.push(Promise.resolve().then(function () {
          return scope.set('tunnelPin', Boolean(draft.tunnelPin))
        }).catch(function (e) { broken.push('tunnelPin: ' + ((e && e.message) || e)) }))

        Promise.all(ops).then(function () {
          setSaving(false)
          if (broken.length > 0) {
            setSaveErr(translate('saveError') + broken.join('; '))
          } else {
            setSaveMsg(translate('saveSuccess'))
            setTimeout(function () { setSaveMsg('') }, 3000)
          }
        })
      }, [scope, draft])

      // Row seat (plugins.row.config): the host page draws title/icon/crumb and the
      // padding, so the summary is a one-liner and the page drops our card chrome.
      var page = !!(props && props.view === 'page')
      if (props && props.view === 'summary') {
        return React.createElement('span', { className: 'lm-sub' }, t('subtitle') || '')
      }

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
            devices.length === 0
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
          ),

          // Settings form container
          React.createElement(
            'div',
            { className: 'lm-form-box' },
            React.createElement(
              ErrorBoundary,
              null,
              React.createElement('div', { className: 'lm-form-title' }, '⚙ ' + (t('title') || translate('title'))),
              React.createElement('div', { className: 'lm-form-desc' }, translate('sub')),
              !scope
                ? React.createElement('div', { className: 'lm-hint' }, 'Settings service unmounted.')
                : snapStatus === 'loading'
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
                style: { textDecoration: 'none', color: 'var(--dsw-alias-state-brand-primary, var(--dsw-alias-label-primary))', fontWeight: 500 },
              },
              translate('healthLink'),
            ),
          ),
        ),
      )
    }

    // QuickQrPopover Component (Feature 2: iOS profile, Feature 4: Interface pills)
    function QuickQrPopover(props) {
      var _open = useState(false)
      var open = _open[0]
      var setOpen = _open[1]

      var _copied = useState(false)
      var copied = _copied[0]
      var setCopied = _copied[1]

      var _rtt = useState(null)
      var rtt = _rtt[0]
      var setRtt = _rtt[1]

      var _interfaces = useState([])
      var interfaces = _interfaces[0]
      var setInterfaces = _interfaces[1]

      var _selectedHost = useState('')
      var selectedHost = _selectedHost[0]
      var setSelectedHost = _selectedHost[1]

      useEffect(function () {
        if (!open) return
        var measure = function () {
          if (typeof document !== 'undefined' && document.hidden) return
          var t0 = getNow()
          fetch('/dsh-lanmode/health?format=json', { cache: 'no-store' })
            .then(function () { setRtt(Math.round(getNow() - t0)) })
            .catch(function () {})
        }
        measure()
        var iv = setInterval(measure, 15000)

        // Fetch categorized network interfaces (Feature 4)
        fetch('/dsh-lanmode/api/interfaces', { cache: 'no-store' })
          .then(function (r) { return r.json() })
          .then(function (data) {
            if (Array.isArray(data) && data.length > 0) {
              setInterfaces(data)
              if (!selectedHost) {
                var first = data[0]
                setSelectedHost(first.address || first.url || window.location.hostname)
              }
            }
          })
          .catch(function () {})

        var onVisible = function () {
          if (document.visibilityState === 'visible') measure()
        }
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', onVisible)
        }
        return function () {
          clearInterval(iv)
          if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', onVisible)
          }
        }
      }, [open, selectedHost])

      var targetUrl = useMemo(function () {
        if (!selectedHost) return window.location.origin
        var protocol = window.location.protocol
        var port = window.location.port ? ':' + window.location.port : ''
        return protocol + '//' + selectedHost + port
      }, [selectedHost])

      var copyUrl = function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(targetUrl).then(function () {
            setCopied(true)
            setTimeout(function () { setCopied(false) }, 2000)
          })
        }
      }

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'lm-sidebar-btn',
            title: translate('quickQrTitle'),
            'aria-label': translate('quickQrTitle'),
            onClick: function () { setOpen(!open) },
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--dsw-alias-label-secondary)',
              cursor: 'pointer',
            },
          },
          React.createElement(
            'svg',
            { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
            React.createElement('rect', { x: 5, y: 2, width: 14, height: 20, rx: 2, ry: 2 }),
            React.createElement('line', { x1: 12, y1: 18, x2: 12.01, y2: 18 }),
          ),
        ),
        open && React.createElement(
          'div',
          {
            className: 'lm-modal-backdrop',
            onClick: function (e) { if (e.target === e.currentTarget) setOpen(false) },
            style: {
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'var(--dsw-alias-mask-bg, rgba(0,0,0,0.6))',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            },
          },
          React.createElement(
            'div',
            {
              className: 'lm-modal-card',
              style: {
                background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-3))',
                border: '1px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1))',
                borderRadius: '16px',
                padding: '24px',
                maxWidth: '380px',
                width: '100%',
                boxShadow: 'var(--dsw-alias-shadow-l3, 0 12px 32px rgba(0,0,0,0.5))',
                color: 'var(--dsw-alias-label-primary)',
                position: 'relative',
              },
            },
            React.createElement(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
              React.createElement('div', { style: { fontWeight: 600, fontSize: '16px' } }, translate('quickQrTitle')),
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: function () { setOpen(false) },
                  style: { background: 'transparent', border: 'none', color: 'var(--dsw-alias-label-tertiary)', cursor: 'pointer', fontSize: '18px' },
                },
                '✕',
              ),
            ),

            // Feature 4: Interface Selector Pills
            interfaces.length > 1 && React.createElement(
              'div',
              { className: 'lm-pills' },
              interfaces.map(function (iface) {
                var isSel = (iface.address === selectedHost) || (iface.name === selectedHost)
                return React.createElement(
                  'button',
                  {
                    key: iface.name + '-' + iface.address,
                    type: 'button',
                    className: 'lm-pill ' + (isSel ? 'lm-pill-active' : ''),
                    onClick: function () { setSelectedHost(iface.address || iface.name) },
                  },
                  (iface.category ? iface.category.toUpperCase() + ': ' : '') + iface.address,
                )
              }),
            ),

            React.createElement(
              'div',
              { className: 'lm-qr-box', style: { textAlign: 'center', padding: '12px' } },
              React.createElement('img', {
                className: 'lm-qr-img',
                src: '/dsh-lanmode/qr?url=' + encodeURIComponent(targetUrl),
                alt: 'LAN QR Code',
                style: { maxWidth: '220px', width: '100%', height: 'auto', background: 'var(--dsw-alias-bg-layer-1, #ffffff)', borderRadius: '8px', padding: '6px' },
              }),
              React.createElement('div', { style: { marginTop: '10px', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, targetUrl),
            ),

            React.createElement(
              'div',
              { style: { display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' } },
              React.createElement(
                'button',
                { type: 'button', className: 'lm-btn lm-btn-primary', style: { flex: 1, minWidth: '110px', justifyContent: 'center' }, onClick: copyUrl },
                copied ? translate('copied') : translate('copyUrl'),
              ),
              (typeof navigator !== 'undefined' && typeof navigator.share === 'function') && React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'lm-btn',
                  style: { justifyContent: 'center' },
                  title: translate('shareUrl'),
                  onClick: function () {
                    try {
                      navigator.share({ title: 'DeepSeek Harness', url: targetUrl }).catch(function () {})
                    } catch (err) { /* bestEffort */ void err }
                  },
                },
                translate('shareUrl'),
              ),
              // Feature 2: 1-Click Apple Configuration Profile
              React.createElement(
                'a',
                {
                  href: '/dsh-lanmode/ca.mobileconfig',
                  download: 'dsh-lanmode.mobileconfig',
                  className: 'lm-btn',
                  style: { justifyContent: 'center' },
                  title: 'Apple iOS/macOS profile with Root CA',
                },
                'iOS (.mobileconfig)',
              ),
              React.createElement(
                'a',
                {
                  href: '/dsh-lanmode/ca.crt',
                  download: 'dsh-lanmode-root-ca.crt',
                  className: 'lm-btn',
                  style: { justifyContent: 'center' },
                  title: 'Root CA for Android/Windows/Linux',
                },
                'CA (.crt)',
              ),
            ),

            React.createElement(
              'div',
              { style: { marginTop: '12px', textAlign: 'center', fontSize: '11px', color: 'var(--dsw-alias-state-success-primary)' } },
              '● ' + (window.location.hostname.endsWith('.local') ? window.location.hostname : 'mDNS') + ' ' + translate('activeMdns') + ' | ' + translate('phoneConnected') + (rtt !== null ? (' | ' + translate('rttLabel') + ': ' + rtt + ' ' + translate('ms')) : ''),
            ),
          ),
        ),
      )
    }

    module.exports.resolveSnapshot = resolveSnapshot
    module.exports.LanModeCard = LanModeCard
    module.exports.inject = ['slots', 'locale', 'settingsScope']
    module.exports.apply = function apply(ctx) {
      if (ctx.locale && ctx.locale.register) {
        try {
          ctx.locale.register(NS, {
            en: {
              title: I18N.en.title,
              sub: I18N.en.sub,
            },
            zh: {
              title: I18N.zh.title,
              sub: I18N.zh.sub,
            },
          })
        } catch (err) { /* bestEffort */ void err }
      }

      function registerSlotWhenReady(slotName, registerFn) {
        if (!ctx.slots) return
        if (typeof ctx.slots.inject === 'function') {
          try {
            ctx.slots.inject(slotName, function () {
              try {
                return registerFn()
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('[dsh-lanmode] Error registering slot ' + slotName + ':', err)
              }
            })
            return
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[dsh-lanmode] Failed to subscribe to slot ' + slotName + ' via slots.inject:', err)
          }
        }
        if (typeof ctx.slots.register === 'function') {
          try {
            registerFn()
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[dsh-lanmode] Failed to register slot ' + slotName + ':', err)
          }
        }
      }

      // List seat (plugins.item): the seat the Plugins page renders as the plugin's own
      // page with its configuration. The label is a static string on purpose — it is
      // resolved while the page renders, and a locale lookup there would take the whole
      // client batch down with it.
      registerSlotWhenReady('plugins.item', function () {
        return ctx.slots.register(
          {
            name: 'plugins.item',
            id: ROW_ID,
            order: 40,
            label: function () { return 'LAN Access & Mobile Gateway' },
            locale: NS,
            inject: function () { return { ctx: ctx } },
          },
          LanModeCard,
        )
      })

      // Row seat and the legacy seat stay as fallbacks.
      registerSlotWhenReady('plugins.row.config', function () {
        return ctx.slots.register(
          {
            name: 'plugins.row.config',
            key: ROW_CONFIG_KEY,
            locale: NS,
            order: 40,
            inject: function () { return { ctx: ctx } },
          },
          LanModeCard,
        )
      })

      registerSlotWhenReady('settings.plugin.item', function () {
        return ctx.slots.register(
          {
            name: 'settings.plugin.item',
            key: NS,
            locale: NS,
            order: 40,
            inject: function () { return { ctx: ctx } },
          },
          LanModeCard,
        )
      })

      registerSlotWhenReady('sidebar.footer.action', function () {
        return ctx.slots.register(
          {
            name: 'sidebar.footer.action',
            id: '@goodandready/dsh-lanmode:qr',
            key: NS + '-footer',
            order: 95,
          },
          QuickQrPopover,
        )
      })

      var pendingNotificationsCount = 0

      function clearAppBadge() {
        pendingNotificationsCount = 0
        try {
          if (typeof navigator !== 'undefined' && typeof navigator.clearAppBadge === 'function') {
            navigator.clearAppBadge().catch(function () {})
          }
        } catch (err) { /* bestEffort */ void err }
      }

      function notifyTurnEnd(body) {
        pendingNotificationsCount++
        try {
          if (typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function') {
            navigator.setAppBadge(pendingNotificationsCount).catch(function () {})
          }
        } catch (err) { /* bestEffort */ void err }

        if (typeof document === 'undefined' || !document.hidden) return
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

        try {
          var notification = new Notification('DeepSeek Harness', {
            body: body || translate('turnEndNotification'),
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'dsh-lanmode-turn',
          })
          notification.onclick = function () {
            if (typeof window !== 'undefined') window.focus()
            clearAppBadge()
            notification.close()
          }
        } catch (err) { /* bestEffort */ void err }
      }

      function setupClientListeners() {
        var disposers = []

        if (ctx.on) {
          var offTurn = ctx.on('turn/end', function () {
            notifyTurnEnd(translate('turnEndNotification'))
            try { if (navigator && navigator.vibrate) navigator.vibrate([30, 50, 30]) } catch (err) { /* bestEffort */ void err }
          })
          if (typeof offTurn === 'function') disposers.push(offTurn)

          var offApproval = ctx.on('approval/asked', function (event) {
            var tool = (event && event.toolName) ? (translate('toolPrefix') + event.toolName) : translate('approvalNotification')
            notifyTurnEnd(tool)
            try { if (navigator && navigator.vibrate) navigator.vibrate([50, 100, 50, 100]) } catch (err) { /* bestEffort */ void err }
          })
          if (typeof offApproval === 'function') disposers.push(offApproval)
        }

        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          var onVisible = function () {
            if (document.visibilityState === 'visible') {
              clearAppBadge()
              try {
                if (ctx.connection && ctx.connection.refresh) ctx.connection.refresh()
              } catch (err) { /* bestEffort */ void err }
              window.dispatchEvent(new CustomEvent('dsh-lanmode-reconnect'))
            }
          }
          document.addEventListener('visibilitychange', onVisible)
          window.addEventListener('focus', onVisible)
          disposers.push(function () {
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('focus', onVisible)
          })
        }

        return function () {
          for (var i = 0; i < disposers.length; i++) {
            try { disposers[i]() } catch (err) { /* bestEffort */ void err }
          }
        }
      }

      var cleanupListeners = null
      if (typeof ctx.effect === 'function') {
        ctx.effect(function () {
          return setupClientListeners()
        }, 'dsh-lanmode-client-listeners')
      } else {
        cleanupListeners = setupClientListeners()
      }
      return cleanupListeners
    }

    return module.exports
  },
})
