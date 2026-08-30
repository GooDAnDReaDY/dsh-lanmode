# 📦 @goodandready/dsh-lanmode

<div align="center">

[![npm version](https://img.shields.io/npm/v/@goodandready/dsh-lanmode.svg?style=flat-square)](https://www.npmjs.com/package/@goodandready/dsh-lanmode)
[![license](https://img.shields.io/github/license/GooDAnDReaDY/dsh-lanmode.svg?style=flat-square)](LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-6366f1.svg?style=flat-square)](https://github.com/topics/dsh-plugin)

**[ 🇬🇧 English ](#-english) • [ 🇷🇺 Русский ](#-русский) • [ 🇨🇳 中文 ](#-中文)**

</div>

---

<a name="-english"></a>
## 🇬🇧 English

LAN network routing and browser media API compatibility helper for DeepSeek Harness Web UI: enables smooth access across local subnets and provides polyfills for non-HTTPS connections.

### Features

- **LAN Subnet Support**: Access DSH Web UI from phones and tablets over `192.168.x.x` / `10.x.x.x`.
- **Media API Polyfills**: Bypasses browser HTTPS security restrictions for dictation and microphone APIs over plain HTTP in local environments.
- **Reverse Proxy Compatibility**: Seamless support for Nginx, Traefik, and Caddy.

### Install

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

---

<a name="-русский"></a>
<details open>
<summary><h2>🇷🇺 Русский (Полное руководство)</h2></summary>

Вспомогательный плагин для доступа по локальной сети и поддержка браузерных медиа-API в DeepSeek Harness: обеспечивает работу с мобильных устройств и предоставляет полифиллы для HTTP-окружения.

### Возможности

- **Доступ по локальной сети**: вход в Web UI с телефонов и планшетов в подсетях `192.168.x.x` / `10.x.x.x`.
- **Полифиллы медиа-API**: обход ограничений браузера на работу микрофона и диктовки без HTTPS в локальной сети.
- **Совместимость с прокси**: прозрачная работа за Nginx, Traefik и Caddy.

### Установка

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

</details>

---

<a name="-中文"></a>
<details>
<summary><h2>🇨🇳 中文 (完整技术文档)</h2></summary>

DeepSeek Harness 局域网访问优化与 HTTP 媒体接口兼容插件：支持内网多端接入与非 HTTPS 媒体接口 Polyfill。

### 核心亮点

- **局域网全端接入**：支持移动设备通过 `192.168.x.x` 等内网网段顺畅访问。
- **媒体接口 Polyfill**：解除纯 HTTP 环境下浏览器录音与语音 API 的安全阻断。
- **反向代理完美适配**：兼容 Nginx、Traefik、Caddy 等反向代理方案。

### 安装方法

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

</details>
