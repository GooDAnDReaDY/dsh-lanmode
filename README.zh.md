# 📦 @goodandready/dsh-lanmode

<div align="center">

<h3>DeepSeek Harness 局域网访问优化、安全上下文补丁与直连网桥插件</h3>

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

**`dsh-lanmode`** 彻底解除 **DeepSeek Harness** Web 界面在局域网内网 IP（`192.168.x.x` / `10.x.x.x`）访问时的浏览器限制与安全上下文拦截。

解决以下痛点：
1. **设置与模型页面锁定**：前端检测非 Localhost 域名自动禁用设置面板（提示 *"settings are unavailable in this browser"*）；
2. **UUID 接口报错**：非 HTTPS 纯 HTTP 下 `crypto.randomUUID()` 缺失导致前端崩溃；
3. **剪贴板复制失效**：`navigator.clipboard` 被浏览器禁用导致一键复制代码失效；
4. **麦克风语音限制**：配合 [`dsh-voice`](https://github.com/GooDAnDReaDY/dsh-voice) 实现局域网移动端语音输入。

```mermaid
graph LR
    subgraph LANDevices [局域网终端: 手机 / 平板 / 笔记本]
        Device[📱 手机 / 💻 移动工作站] -->|HTTP 或局域网 HTTPS| Bridge[dsh-lanmode 直连网桥]
    end

    subgraph Shims [前端 tapIndex 注入补丁]
        Bridge --> Shim1[🔓 解除 Loopback 限制: 开启设置与模型管理]
        Bridge --> Shim2[🆔 补全 crypto.randomUUID (RFC 4122)]
        Bridge --> Shim3[📋 补全剪贴板复制降级兼容]
        Bridge --> Shim4[🎙️ 语音输入麦克风兼容适配]
    end

    subgraph DSHCore [DSH 完整可用界面]
        Shim1 --> FullWeb[✅ 100% 完整功能可用]
        Shim2 --> FullWeb
        Shim3 --> FullWeb
        Shim4 --> FullWeb
    end

    style LANDevices fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4
    style Shims fill:#181825,stroke:#cba6f7,stroke-width:2px,color:#cdd6f4
    style DSHCore fill:#11111b,stroke:#a6e3a1,stroke-width:2px,color:#cdd6f4
```

---

## 📦 安装指南

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

---

## 📄 开源协议

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
