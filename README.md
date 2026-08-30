# 📦 @goodandready/dsh-lanmode

<div align="center">

<h3>Local Network (LAN) Access Enabler, Secure Context Shims & Direct Bridge for DeepSeek Harness</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-lanmode"><img src="https://img.shields.io/npm/v/@goodandready/dsh-lanmode.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/GooDAnDReaDY/dsh-lanmode.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ Overview

**`dsh-lanmode`** unlocks full, unrestricted access to the **DeepSeek Harness** Web UI across your local area network (LAN `192.168.x.x` / `10.x.x.x`) from mobile phones, tablets, laptops, and remote workstations.

By default, modern web browsers and the DSH web frontend lock down essential features when accessed over plain HTTP from non-localhost IPs:
1. **Disabled Settings & Models**: The Web UI detects non-loopback hostnames (`!isLoopbackHostname`) and locks the **Settings** tab and **Models** page with `"settings are unavailable in this browser"`.
2. **Broken UUID Generation**: `crypto.randomUUID()` is disabled by browsers on non-HTTPS origins, causing API errors and failed uploads.
3. **Broken Clipboard Copying**: `navigator.clipboard` is blocked on HTTP, disabling "Copy" buttons.
4. **Blocked Microphone APIs**: Browsers block Web Audio & microphone access for voice input plugins like `dsh-voice`.

`dsh-lanmode` injects non-invasive shims via `webServer.tapIndex`, hosts a direct bridge listener, and provides auto-generated TLS certificates to restore 100% feature parity on LAN.

```mermaid
graph LR
    subgraph LANDevices [Remote LAN Devices: Phone / Tablet / Laptop]
        Device[📱 Mobile / 💻 Laptop on 192.168.1.x] -->|Plain HTTP or LAN HTTPS| Bridge[dsh-lanmode Direct Bridge]
    end

    subgraph Shims [Client-Side Shims via tapIndex]
        Bridge --> Shim1[🔓 Loopback Hostname Override: Unlocks Settings & Models]
        Bridge --> Shim2[🆔 RFC 4122 crypto.randomUUID Polyfill]
        Bridge --> Shim3[📋 Fallback navigator.clipboard Polyfill]
        Bridge --> Shim4[🎙️ Media & Audio API Shims for Voice Input]
    end

    subgraph DSHCore [DeepSeek Harness Web Server]
        Shim1 --> FullWeb[✅ 100% Fully Functional Web UI]
        Shim2 --> FullWeb
        Shim3 --> FullWeb
        Shim4 --> FullWeb
    end

    style LANDevices fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4
    style Shims fill:#181825,stroke:#cba6f7,stroke-width:2px,color:#cdd6f4
    style DSHCore fill:#11111b,stroke:#a6e3a1,stroke-width:2px,color:#cdd6f4
```

---

## ✨ Key Capabilities & Shims

* 🔓 **Settings & Models Tab Unlock**: Overrides the internal `isLoopbackHostname` restriction in the client bundle, restoring full read/write access to **Settings**, **Plugin Cards**, and **Models** from any device on your LAN.
* 🆔 **RFC 4122 `crypto.randomUUID()` Polyfill**: Injects a cryptographically robust UUID generator when running in non-secure HTTP contexts, preventing client crashes during file uploads and session creation.
* 📋 **Clipboard Copy Polyfill**: Injects a fallback copy pipeline using `document.execCommand('copy')` so code snippet copy buttons work on mobile browsers.
* 🎙️ **Microphone & Voice Input Support**: Enables audio capture compatibility for [`dsh-voice`](https://github.com/GooDAnDReaDY/dsh-voice) across LAN.
* 🛡️ **Subnet CIDR Access Control**: Restrict LAN access using strict CIDR notation (e.g. `allowSubnets: ["192.168.1.0/24"]`).
* 🔒 **Automatic Self-Signed TLS (`tls.js`)**: Optionally spins up an HTTPS listener with on-the-fly generated certificates for native iOS Safari WebRTC compatibility.
* 🩺 **Diagnostics & Health Dashboard**: Live status report available at `GET /dsh-lanmode/health` detailing network interfaces and active shims.

---

## 📦 Quick Installation

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

> [!IMPORTANT]
> Restart DSH Web UI after installation (`systemctl --user restart dsh-web`) and refresh any open browser tabs.

---

## ⚙️ Configuration Reference (`settings.yaml`)

```yaml
dsh-lanmode:
  enabled: true
  directBridge:
    enabled: true
    port: 3000
    host: 0.0.0.0
  allowSubnets:
    - 192.168.0.0/16
    - 10.0.0.0/8
    - 127.0.0.1/32
  enableTls: false
  shimLoopback: true
  shimRandomUuid: true
  shimClipboard: true
```

---

## 📄 License

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
