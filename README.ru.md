# 📦 @goodandready/dsh-lanmode

<div align="center">

<h3>Доступ к веб-интерфейсу по локальной сети (LAN), полифиллы Secure Context и прямой мост для DeepSeek Harness</h3>

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

**`dsh-lanmode`** открывает полный доступ ко всем функциям веб-интерфейса **DeepSeek Harness** при подключении по локальной сети (`192.168.x.x` / `10.x.x.x`) со смартфонов, планшетов, ноутбуков и других устройств.

По умолчанию браузеры и веб-интерфейс DSH блокируют ключевые возможности при открытии страницы по обычному HTTP не с localhost:
1. **Блокировка настроек и моделей**: интерфейс проверяет адрес хоста (`!isLoopbackHostname`) и блокирует вкладку **Настройки** и страницу **Модели** с сообщением *"settings are unavailable in this browser"*, оставляя карточки плагинов пустыми.
2. **Падение генерации UUID**: `crypto.randomUUID()` отсутствует в незащищенном HTTP-контексте, что приводит к сбоям при создании сессий и загрузке файлов.
3. **Блокировка буфера обмена**: `navigator.clipboard` не работает без HTTPS, из-за чего кнопки копирования кода не реагируют на нажатия.
4. **Блокировка микрофона**: браузеры запрещают доступ к микрофону для голосового ввода (`dsh-voice`).

`dsh-lanmode` внедряет полифиллы в `index.html` через точку расширения `webServer.tapIndex`, поднимает прямой мост и предоставляет опциональный самоподписанный TLS для 100% работоспособности всех функций в LAN.

```mermaid
graph LR
    subgraph LANDevices [Устройства в локальной сети: телефон / планшет / ноутбук]
        Device[📱 Смартфон / 💻 Ноутбук в сети 192.168.1.x] -->|HTTP или LAN HTTPS| Bridge[Прямой мост dsh-lanmode]
    end

    subgraph Shims [Полифиллы через tapIndex]
        Bridge --> Shim1[🔓 Снятие запрета Loopback: разблокировка Настроек и Моделей]
        Bridge --> Shim2[🆔 Полифилл crypto.randomUUID (RFC 4122)]
        Bridge --> Shim3[📋 Фолбек navigator.clipboard]
        Bridge --> Shim4[🎙️ Полифиллы аудио и микрофона для голосового ввода]
    end

    subgraph DSHCore [Веб-интерфейс DeepSeek Harness]
        Shim1 --> FullWeb[✅ 100% Рабочий интерфейс без ограничений]
        Shim2 --> FullWeb
        Shim3 --> FullWeb
        Shim4 --> FullWeb
    end

    style LANDevices fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4
    style Shims fill:#181825,stroke:#cba6f7,stroke-width:2px,color:#cdd6f4
    style DSHCore fill:#11111b,stroke:#a6e3a1,stroke-width:2px,color:#cdd6f4
```

---

## ✨ Ключевые возможности и полифиллы

* 🔓 **Разблокировка вкладок «Настройки» и «Модели»**: снимает ограничение `isLoopbackHostname`, возвращая возможность редактировать настройки плагинов и выбирать модели с любых устройств в локальной сети.
* 🆔 **Полифилл `crypto.randomUUID()`**: добавляет генератор UUID (RFC 4122 v4) для работы без HTTPS.
* 📋 **Фолбек копирования в буфер**: восстанавливает работу кнопок «Копировать код» через `document.execCommand('copy')`.
* 🎙️ **Разблокировка микрофона**: обеспечивает работу голосового ввода [`dsh-voice`](https://github.com/GooDAnDReaDY/dsh-voice) на мобильных устройствах.
* 🛡️ **Контроль доступа по подсетям CIDR**: ограничение доступа списком доверенных подсетей (`allowSubnets: ["192.168.1.0/24"]`).
* 🔒 **Автоматический самоподписанный TLS (`tls.js`)**: генерация локальных сертификатов для поддержки HTTPS на iOS Safari.
* 🩺 **Диагностическая страница**: отчет о состоянии интерфейсов доступен по адресу `GET /dsh-lanmode/health`.

---

## 📦 Быстрая установка

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

---

## ⚙️ Пример конфигурации (`settings.yaml`)

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

## 📄 Лицензия

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
