# 📦 @goodandready/dsh-lanmode

<div align="center">

<h3>Доступ по локальной сети и полифиллы медиа-API браузера без HTTPS</h3>

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

## ⚡ Обзор

**`dsh-lanmode`** обеспечивает доступ к веб-интерфейсу DSH с мобильных устройств по локальной сети (`192.168.x.x` / `10.x.x.x`) и снимает блокировки браузера на микрофон при работе без HTTPS.

```mermaid
graph LR
    Phone[📱 Смартфон / Планшет в LAN] -->|Подключение по HTTP| DSH[Web UI DeepSeek Harness]
    DSH --> Polyfill[Полифилл dsh-lanmode]
    Polyfill --> MicAPI[🎙️ Разблокированная диктовка и аудио]
```

---

## 📦 Быстрая установка

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

---

## 📄 Лицензия

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
