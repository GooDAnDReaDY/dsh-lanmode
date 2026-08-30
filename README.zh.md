# 📦 @goodandready/dsh-lanmode

<div align="center">

<h3>DeepSeek Harness 局域网访问优化与非 HTTPS 媒体接口兼容插件</h3>

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

## ⚡ 插件概览

**`dsh-lanmode`** 解决移动端通过局域网内网 IP (`192.168.x.x`) 访问时浏览器纯 HTTP 环境对麦克风及媒体 API 的安全拦截。

```mermaid
graph LR
    Phone[📱 局域网内手机 / 平板端] -->|HTTP 协议访问| DSH[DSH Web 界面]
    DSH --> Polyfill[dsh-lanmode 媒体接口 Polyfill]
    Polyfill --> MicAPI[🎙️ 解除限制的录音与语音接口]
```

---

## 📦 安装指南

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

---

## 📄 开源协议

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
