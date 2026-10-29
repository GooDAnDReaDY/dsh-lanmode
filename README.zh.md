# 📦 @goodandready/dsh-lanmode

<div align="center">

<h3>局域网访问 (LAN)、mDNS (dsh.local)、PWA、Root CA、快速二维码、后台推送与自动 TLS 支持 (DeepSeek Harness)</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-lanmode"><img src="https://img.shields.io/npm/v/@goodandready/dsh-lanmode.svg?style=flat&color=6366f1" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981.svg?style=flat" alt="license"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ 功能概览

`dsh-lanmode` 为 DeepSeek Harness 提供完整的局域网与外网安全访问支持：

1. **📱 Quick QR 快速二维码**：侧边栏底部 (`Quick QR` 位于 `sidebar.footer` / `sidebar.rail`) 提供纯 SVG 二维码弹窗，支持移动端扫码即连。终端支持 `/mobileqr` 工具与 ASCII 二维码输出。
2. **📲 PWA 与独立应用模式**：提供 `manifest.json`，iOS/Android 全屏独立模式与刘海屏安全边距 (`viewport-fit=cover`)。
3. **🌐 自动 mDNS (`dsh.local`)**：内置 UDP 5353 responder，自动在局域网广播 `dsh.local`。
4. **🔐 本地 Root CA 与 HTTPS**：生成 10 年有效期的本地根证书及带 SAN 的服务器证书。访问 `/dsh-lanmode/ca.crt` 即可一键下载信任。
5. **🔔 后台通知 (Web Notifications API)**：在后台标签页接收回合结束与审批请求系统推送。
6. **🛡️ 安全与认证体系**：
   - 登录密码支持纯文本与 scrypt 密钥派生，使用 `timingSafeEqual` 进行恒定时间比较防时序攻击。
   - LAN PIN 验证：支持纯文本与 `PBKDF2` 强哈希（`pbkdf2$sha512$100000$salt$hash`）。5 次失败自动锁定 15 分钟。
   - 设备与会话 Token 均采用 `SHA-256` 哈希加盐存储。
   - 子网角色分离（`adminAllow` 与 `guestAllow`），访客子网禁止改写系统设置。
7. **☁️ Cloudflare 隧道与 Tailscale Funnel**：
   - 支持临时 `Quick Tunnel` (trycloudflare.com) 与固定 `Named Tunnel` 模式（Token 通过 `TUNNEL_TOKEN` 环境变量传递，不暴露在进程列表）。
   - 配置项 `tunnelPin` 强制外网访问通过 LAN PIN 鉴权。
   - 支持一键开启 `Tailscale Funnel`，自带权威 Let's Encrypt 证书。
8. **📱 设备与会话管理**：自动识别连接设备型号与操作系统，支持一键撤销单个或全部其它会话。

---

## 📦 安装方法

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

---

## ⚙️ 配置说明 (`cordis.patch.yml`)

```yaml
- id: dsh-lanmode
  config:
    mode: direct
    directPort: 3080
    tunnel: off              # off, quick 或 named
    tunnelPin: true
    tailscaleFunnel: false
    passwordAuth: false
```

---

## 📄 开源许可证

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
