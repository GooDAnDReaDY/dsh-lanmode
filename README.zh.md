# 📦 @goodandready/dsh-lanmode

<div align="center">

<h3>DeepSeek Harness 局域网访问优化、安全上下文补丁、直连网桥与自动 TLS 插件</h3>

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

## ⚡ 核心痛点：为什么局域网 IP 访问 DSH 会遭遇多重功能锁定

在纯 HTTP 环境下通过内网 IP（如 `192.168.x.x` 或 `10.x.x.x`）访问 **DeepSeek Harness** 时，浏览器与 DSH 前端会触发多项强制拦截：

1. 🔒 **设置与模型管理锁定**：前端检测 `!isLoopbackHostname` 将设置服务降级为只读内存态，所有插件配置卡片变空，模型页面提示 *"settings are unavailable in this browser"*；
2. 💥 **UUID 生成崩溃**：`crypto.randomUUID()` 仅在安全上下文存在，纯 HTTP 下调用直接报错崩溃；
3. 📋 **剪贴板复制失效**：`navigator.clipboard` 接口被禁用，代码块一键复制按钮无响应；
4. 🎙️ **麦克风语音输入拦截**：移动端浏览器禁止纯 HTTP 访问麦克风接口，导致 [`dsh-voice`](https://github.com/GooDAnDReaDY/dsh-voice) 语音功能瘫痪；
5. 🛡️ **核心 API 环回接口限制**：核心设置及密钥接口只接受来自 `127.0.0.1` 的请求。

`dsh-lanmode` 通过 `webServer.tapIndex` 动态注入无侵入 Polyfill 补丁、启动直连网桥及自动颁发局域网 TLS 证书，在局域网内 100% 恢复全功能体验。

```mermaid
graph LR
    subgraph RemoteDevices [局域网终端设备]
        Client[📱 移动端 Safari / 💻 局域网笔记本: 192.168.1.50] -->|HTTP / LAN HTTPS| Bridge[dsh-lanmode 智能直连网桥]
    end

    subgraph ShimsLayer [前端 tapIndex 注入补丁层]
        Bridge --> Shim1[🔓 解除 Loopback 限制: 开启设置与模型管理]
        Bridge --> Shim2[🆔 补全 RFC 4122 crypto.randomUUID Polyfill]
        Bridge --> Shim3[📋 补全剪贴板复制降级兼容]
        Bridge --> Shim4[🔐 自动颁发 TLS 证书: 解锁 dsh-voice 麦克风权限]
    end

    subgraph HostBackend [DSH 服务端核心]
        Bridge --> HeaderRewrite[请求头 Host/Origin 环回重写]
        HeaderRewrite --> PrivilegedAPI[设置、凭据与模型管理接口]
    end

    subgraph Output [最终效果]
        Shim1 --> FullWeb[✅ 局域网内 100% 完整可用体验]
        Shim2 --> FullWeb
        Shim3 --> FullWeb
        Shim4 --> FullWeb
        PrivilegedAPI --> FullWeb
    end

    style RemoteDevices fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4
    style ShimsLayer fill:#181825,stroke:#cba6f7,stroke-width:2px,color:#cdd6f4
    style HostBackend fill:#11111b,stroke:#a6e3a1,stroke-width:2px,color:#cdd6f4
    style Output fill:#181825,stroke:#f38ba8,stroke-width:2px,color:#cdd6f4
```

---

## 📦 安装指南

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

---

## 📄 开源协议

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
