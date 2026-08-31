# 📦 @goodandready/dsh-lanmode

<div align="center">

<h3>Доступ к веб-интерфейсу по локальной сети (LAN), полифиллы Secure Context, прямой мост и авто-TLS для DeepSeek Harness</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-lanmode"><img src="https://img.shields.io/npm/v/@goodandready/dsh-lanmode.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<p align="center">
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/Все_проекты_автора-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="Все проекты автора"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ Почему DSH ломается при входе по локальной сети (LAN)

По умолчанию современные браузеры и веб-интерфейс **DeepSeek Harness** намеренно блокируют ключевой функционал при открытии страницы по обычному HTTP с IP-адресов локальной сети (например, `192.168.x.x` или `10.x.x.x`):

1. 🔒 **Блокировка настроек и моделей**: клиентская часть проверяет имя хоста через `isLoopbackHostname`. В сети служба настроек переходит в аварийный режим «памяти»: все карточки плагинов пустые, вкладки получают статус `"unavailable"`, изменения отбрасываются до отправки, а страница **Модели** выводит *"settings are unavailable in this browser"*.
2. 💥 **Падение генерации UUID**: метод `crypto.randomUUID()` существует только в безопасном контексте (HTTPS или localhost). На чистом HTTP в LAN загрузка файлов, вызовы инструментов и создание сессий мгновенно падают.
3. 📋 **Блокировка буфера обмена**: `navigator.clipboard` полностью отключен браузером на HTTP, из-за чего кнопки копирования кода не реагируют на нажатия.
4. 🎙️ **Запрет микрофона для голосового ввода**: браузеры блокируют `navigator.mediaDevices.getUserMedia` на HTTP, делая голосовой ввод через [`dsh-voice`](https://github.com/GooDAnDReaDY/dsh-voice) невозможным на мобильных устройствах.
5. 🛡️ **Защита API ядра**: ядро DSH разрешает методы настроек и ключей (`/api/settings.*`, `/api/credentials.*`, `/api/models.*`) только клиентам с петли `127.0.0.1`.

`dsh-lanmode` полностью решает эти проблемы через внедрение полифиллов в `index.html` через точку расширения `webServer.tapIndex`, запуск прямого моста и автоматический выпуск локальных TLS-сертификатов.

```mermaid
graph LR
    subgraph RemoteDevices [Устройства в локальной сети: телефон / планшет / ноутбук]
        Client[📱 Смартфон / 💻 Ноутбук в LAN: 192.168.1.50] -->|HTTP / LAN HTTPS| Bridge[Прямой мост dsh-lanmode]
    end

    subgraph ShimsLayer [Слой полифиллов через tapIndex]
        Bridge --> Shim1[🔓 Снятие запрета Loopback: разблокировка Настроек и Моделей]
        Bridge --> Shim2[🆔 Полифилл crypto.randomUUID (RFC 4122)]
        Bridge --> Shim3[📋 Фолбек копирования navigator.clipboard]
        Bridge --> Shim4[🔐 Авто-TLS: разблокировка микрофона для dsh-voice]
    end

    subgraph HostBackend [Бэкенд хоста DSH]
        Bridge --> HeaderRewrite[Подмена заголовков Host/Origin на loopback]
        HeaderRewrite --> PrivilegedAPI[Привилегированные API настроек и ключей]
    end

    subgraph Output [Результат]
        Shim1 --> FullWeb[✅ 100% Рабочий интерфейс без ограничений по всей LAN]
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

## ✨ Полный обзор возможностей и архитектуры

### 1. 🔓 Разблокировка вкладок «Настройки» и «Модели» (`lib/shim.js`, `lib/loopback-source.js`)
* Патчит проверку `isLoopback` на лету в `index.html` и бандле без изменения файлов ядра на диске.
* **Сохранение топологии сети**: настройки становятся доступны для чтения и записи, но система сохраняет информацию о том, где открыт интерфейс (чтобы локальные файлы открывались на сервере или на клиенте корректно).

### 2. 🆔 Полифилл `crypto.randomUUID()` (RFC 4122 v4)
* Внедряет генератор UUID через `getRandomValues` при работе по незащищенному HTTP, предотвращая краши интерфейса.

### 3. 📋 Фолбек копирования в буфер обмена
* Добавляет рабочий фолбек через `document.execCommand('copy')`, восстанавливая копирование блоков кода на мобильных устройствах.

### 4. 🎛️ 3 режима работы (`lib/mode.js`)
* **`direct` (Прямой слушатель)**: открывает порт на `0.0.0.0`, принимает подключения из LAN и проксирует их на петлю с подменой заголовков.
* **`proxy` (Режим за прокси)**: для работы за Nginx / Caddy / Traefik. Не открывает лишних портов, только внедряет полифиллы в `index.html`.
* **`auto` (Умный автовыбор)**: проверяет порт через TCP knock. Если внешний прокси уже слушает порт — включается режим `proxy`, если порт свободен — безопасно поднимается прямой мост.

### 5. 🔐 Автоматический самоподписанный TLS для микрофона (`lib/tls.js`)
* Браузеры блокируют `getUserMedia` на голом HTTP.
* Плагин автоматически генерирует сертификат X.509 через `openssl` (срок 397 дней, авто-продление за 30 дней), обеспечивая HTTPS в LAN для работы голосового ввода [`dsh-voice`](https://github.com/GooDAnDReaDY/dsh-voice) на iPhone, iPad и Android.

### 6. 🛡️ Фильтрация подсетей CIDR и контроль привилегий (`lib/access.js`, `lib/privileged.js`, `lib/handoff.js`)
* **Белый список подсетей**: ограничение доступа доверенными IP (`allowSubnets: ["192.168.1.0/24"]`).
* **Контроль привилегий**: флаг `allowPrivileged` разрешает или запрещает менять ключи и настройки из LAN.
* **Токены сопряжения**: безопасная передача сессии новым устройствам.

### 7. 🩺 Диагностическая страница (`lib/health.js`)
* Доступна по адресу `GET /dsh-lanmode/health` со сводкой: режим, сетевые интерфейсы, статус TLS, полифиллы и разрешенные подсети.

### 8. 🔍 Отладочные переключатели в URL
* `?lanmode=off` — полностью отключить полифиллы (проверка исходного заблокированного состояния).
* `?lanmode=invert` — симуляция внешней сети на localhost.

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
  mode: auto             # 'auto', 'direct' или 'proxy'
  directBridge:
    enabled: true
    port: 3000
    host: 0.0.0.0
  allowSubnets:
    - 192.168.0.0/16
    - 10.0.0.0/8
    - 127.0.0.1/32
  enableTls: false        # Включить для работы микрофона по HTTPS
  allowPrivileged: true   # Разрешить менять настройки и ключи из LAN
  shimLoopback: true
  shimRandomUuid: true
  shimClipboard: true
```

---

## 📄 Лицензия

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
