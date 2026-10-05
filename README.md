# 📦 @goodandready/dsh-lanmode

<div align="center">

<h3>LAN Access, mDNS (dsh.local), PWA, Root CA, Quick QR, Notifications & Auto-TLS for DeepSeek Harness</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-lanmode"><img src="https://img.shields.io/npm/v/@goodandready/dsh-lanmode.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<p align="center">
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/Author_Portfolio-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="Author Projects"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ Why DSH Breaks Over LAN

By default, modern browsers and DeepSeek Harness block key capabilities when accessed over plain HTTP from local IP addresses:
1. 🔒 **Disabled Settings**: `isLoopbackHostname` disables plugin cards and switches settings to read-only memory mode outside loopback.
2. 💥 **Broken UUIDs**: `crypto.randomUUID()` requires a secure context (HTTPS or localhost).
3. 📋 **Blocked Clipboard & Microphone**: `navigator.clipboard` and `getUserMedia` are blocked over plain HTTP.
4. 🛡️ **Core API Protection**: DSH core restricts configuration and credential APIs to `127.0.0.1` callers.

`dsh-lanmode` solves these limitations via polyfill injection, a direct TLS bridge, mDNS, local Root CA, and an interactive settings card.

---

## ✨ Features Overview

### 1. 📱 Quick QR Popover, `/mobileqr` Command & Mobile Pairing
* **Sidebar Quick QR**: Tap the mobile icon in the sidebar footer (`sidebar.footer` / `sidebar.rail`) to open an interactive popover with an SVG QR code, LAN/WAN toggle, and copy button.
* **Terminal & Chat**: Register the `/mobileqr` chat tool and print an ASCII QR code to stdout on launch.
* **Diagnostics**: Vector QR available at `/dsh-lanmode/qr` and on `/dsh-lanmode/health`.

### 2. 📲 PWA & Standalone Mode
* Route `/dsh-lanmode/manifest.json` with `viewport-fit=cover`, `apple-mobile-web-app-capable`, and `theme-color`.
* Fullscreen standalone app experience on iOS and Android with notch safe-area insets.

### 3. 🌐 Automatic mDNS (`dsh.local`)
* Built-in lightweight UDP 5353 responder broadcasting **`dsh.local`** across the local subnet.

### 4. 🔐 Local Root CA for Trusted HTTPS
* Self-generated **`dsh-lanmode Local Root CA`** (10-year validity) $\rightarrow$ **`Server Certificate`** with SANs for `dsh.local`, LAN IPs, and localhost.
* Route `GET /dsh-lanmode/ca.crt` for certificate installation on mobile devices. Supports SNI via `tlsSites`.

### 5. 🔔 Background System Notifications (Web Notifications API)
* Hooks into `turn/end` and `approval/asked` session events. Dispatches native push notifications when the tab is hidden (`document.hidden`).

### 6. 🎨 Settings Card in «Settings → Plugins» (`lib/client.js`)
* Interactive plugin card: connection status, one-click LAN URL copying, QR popover toggle, notification switch, and Root CA link.

### 7. 🛡️ Access Control, LAN PIN & Security
* **`unlockPrivileged`**: Master gate for settings & credentials mutation from LAN.
* **`lanPin` / `lanPinRef`**: Optional PIN protection for privileged operations. LAN PIN supports both plaintext and PBKDF2 digests (`pbkdf2$sha512$100000$salt$hash`) generated via `hashPin()`. Brute-force rate limiting enforces a 15-minute lockout after 5 consecutive failed attempts per IP (HTTP 429).
* **Subnet Role Separation**: Distinct `adminAllow` and `guestAllow` CIDR rules. Subnets designated under `guestAllow` are strictly prohibited from mutating system settings or revoking sessions (`403 Forbidden`).
* **Route Protection & Body Limits**: Internal plugin routes (`/dsh-lanmode/devices`, `/dsh-lanmode/tunnel`, `/dsh-lanmode/api/config`) feature fail-closed authorization. `GET /dsh-lanmode/tunnel` requires administrator verification (403 for guests). Login, config, and tunnel requests stop reading after 64 KiB and return HTTP 413.
* **CSRF Mitigation**: Mutating POST requests reject cross-site invocations (`Sec-Fetch-Site: cross-site`) and validate origin headers.
* **Password Storage & Verification**: Passwords support both plaintext and scrypt digests (`scrypt$16384$8$1$salt$hash`) via `hashAuthPassword()`. Verification runs in constant time (`timingSafeEqual`), with dummy scrypt passes preventing timing attacks. Changing password immediately revokes all other active sessions for that user.
* **Session & Device Tokens**: Active sessions and device tokens are indexed via SHA-256 digests (`hashToken`); raw session and cookie tokens are never stored in memory registry, JSON API, or serialized disk files (`dsh-lanmode-devices.json` and `.bak`).
* **Atomic Backup Snapshots & Fail-Closed Storage**: Registry and ban `.bak` files are generated atomically using temporary files and atomic rename. Corrupted data files without valid backup engage fail-closed security mode (HTTP 403 for non-loopback traffic).
* **Instant Secret Rotation**: Secret references (`lanPinRef`, `authPasswordRef`, `tunnelTokenRef`) query the provider context fresh per operation without positive TTL cache, applying external rotations immediately.
* **UI Localization**: PIN modal dynamically resolves localization via `parts.translate` across Chinese, English, and Russian without exposing raw dictionary keys.

### 8. 📱 Connected Devices & Session Management
* Live client presence tracking and device OS/browser discovery (iOS, Android, Windows, macOS, Linux).
* Per-device token revocation and emergency "Revoke All Others" kill switch in the settings card.
* Bridge routes that list or revoke devices require administrator access (403 for guests).

### 9. 🌐 Multi-Interface & Mesh Detection
* Automatic identification of local LAN, Tailscale (100.x.y.z), WireGuard, and VPN adapters with quick-select UI pills.
* Automated firewall management for Windows Defender Firewall, Linux UFW, and firewalld.

### 10. ⚡ Live Network Telemetry & HTTP/2 ALPN
* Compact real-time telemetry widget displaying RTT ping latency, active concurrent connections, and streaming data volume.
* Native HTTP/2 (ALPN `h2`) bridge support alongside HTTP/1.1 for multiplexed low-latency streaming.

### 11. 🚀 Connection Pooling & SSE Streaming Isolation
* Upstream connections to DeepSeek Harness are segregated into two independent pools: standard HTTP (up to 100 reusable sockets with 15s queue timeout) and dedicated streaming pool (SSE, `/api/chat/stream`). Streaming traffic never starves static or API responses.

### 12. ☁️ Cloudflare WAN Tunnels & Tunnel PIN
* **Quick Tunnels and Named Tunnels**: Remote access via Cloudflare without port forwarding or static IP. Supports temporary Quick Tunnels (`trycloudflare.com`) and persistent Named Tunnels (`tunnelToken` / `tunnelTokenRef`).
* **Fail-Closed Tunnel Startup**: Tunnel service verifies listener health and refuses to start if direct listener is not active, never falling back to unencrypted core port.
* **Tunnel PIN**: When `lanPin` (or `lanPinRef`) is configured, inbound HTTP requests and WebSocket upgrades through Cloudflare tunnels require LAN PIN verification (`tunnelPin: true`, default). If no PIN is configured, tunnel requests do not challenge a PIN.

### 13. 🔄 One-Click Plugin Updates
* Integrated updater service in settings card (`/api/dsh-lanmode/update`) with npm registry check and protected admin perimeter.

---

## 📦 Quick Install

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

---

## ⚙️ Configuration (Profile `cordis.patch.yml`)

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: dsh-lanmode
  config:
    mode: direct             # direct, proxy, or auto
    directHost: 0.0.0.0      # defaults to 127.0.0.1
    directPort: 3080
    mdns: true               # dsh.local on LAN
    pwa: true                # PWA manifest
    tls: self-signed         # self-signed, files, or off
    unlockPrivileged: true   # LAN settings access
    lanPinRef: ""            # PIN secret
    tunnelTokenRef: ""       # Cloudflare tunnel token
    allow:
      - 192.168.0.0/16
      - 10.0.0.0/8
    passwordAuth: false      # Password gate
    authPasswordRef: ""      # Password secret
    publicHost: ""
    disabledUsers: []
    trustedProxyCidrs: []
    tlsSites: []
    adaptiveCompression: true
```

---

## 📄 License

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
