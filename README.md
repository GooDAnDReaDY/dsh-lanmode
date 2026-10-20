# 📦 @goodandready/dsh-lanmode

<div align="center">

<h3>LAN Access, mDNS (dsh.local), PWA, Root CA, Quick QR, Notifications & Auto-TLS for DeepSeek Harness</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-lanmode"><img src="https://img.shields.io/npm/v/@goodandready/dsh-lanmode.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/Author_Portfolio-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="Author Projects"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ Overview & Features

`dsh-lanmode` brings seamless and secure local network (LAN) and WAN remote access to DeepSeek Harness:

1. **📱 Quick QR Popover**: Tap the smartphone icon in the sidebar footer (`Quick QR` in `sidebar.footer` / `sidebar.rail`) to open an interactive SVG QR code. Supports the `/mobileqr` chat tool and ASCII QR output.
2. **📲 PWA & Standalone Mode**: Serves `/dsh-lanmode/manifest.json` with `viewport-fit=cover` for full-screen mobile experience.
3. **🌐 Automatic mDNS (`dsh.local`)**: Built-in UDP 5353 responder announces `dsh.local` across the LAN automatically.
4. **🔐 Local Root CA & HTTPS**: Generates a 10-year Root CA and trusted SAN certificates (`dsh.local`, LAN IP, localhost). One-click download via `/dsh-lanmode/ca.crt`.
5. **🔔 Background Web Push & Notifications API**: Delivers system push notifications on agent turn end and approval requests.
6. **🛡️ Comprehensive Security & Authentication**:
   - Authentication passwords support plaintext and scrypt key derivation. Verified in constant time via `timingSafeEqual`.
   - LAN PIN protection with plaintext or `PBKDF2` stretching (`pbkdf2$sha512$100000$salt$hash`). Auto-lockout for 15 minutes after 5 consecutive failures.
   - Device and session tokens stored exclusively as salted `SHA-256` digests.
   - Subnet role separation (`adminAllow` and `guestAllow`). Guest subnets cannot mutate settings or revoke sessions.
7. **☁️ Cloudflare WAN Tunnels & Tailscale Funnel**:
   - Supports zero-config `Quick Tunnels` (trycloudflare.com) and persistent `Named Tunnels` via token.
   - The `tunnelPin` option enforces LAN PIN verification for all requests arriving over WAN tunnels.
   - 1-click `Tailscale Funnel` integration providing public HTTPS with automated trusted Let's Encrypt certificates.
8. **📱 Device Registry & Session Revocation**: Track connected devices and revoke active sessions individually or all-at-once.

---

## 📦 Installation

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

---

## ⚙️ Configuration (`cordis.patch.yml`)

```yaml
- id: dsh-lanmode
  config:
    mode: direct             # direct, proxy, or auto
    directHost: 0.0.0.0
    directPort: 3080
    mdns: true               # dsh.local
    pwa: true
    tls: self-signed
    unlockPrivileged: true
    lanPinRef: ""
    tunnel: off              # off, quick, or named
    tunnelPin: true
    tailscaleFunnel: false
    allow:
      - 192.168.0.0/16
      - 10.0.0.0/8
    passwordAuth: false
    adaptiveCompression: true
```

---

## 📄 License

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
