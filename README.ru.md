# 📦 @goodandready/dsh-lanmode

<div align="center">

<h3>Доступ к веб-интерфейсу по локальной сети (LAN), mDNS (dsh.local), PWA, Root CA, QR-код, фоновые уведомления и авто-TLS для DeepSeek Harness</h3>

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

## ⚡ Описание и назначение

`dsh-lanmode` обеспечивает полноценный безопасный доступ к DeepSeek Harness из локальной сети (LAN) и через интернет:

1. **📱 Поповер Quick QR**: Иконка смартфона в подвале сайдбара (`Quick QR` в `sidebar.footer` / `sidebar.rail`) открывает SVG QR-код для подключения с мобильных устройств. Поддерживается команда `/mobileqr` и вывод ASCII QR в терминал.
2. **📲 PWA & Standalone**: Поддержка манифеста, полноэкранный режим на iOS/Android без интерфейса браузера (`viewport-fit=cover`).
3. **🌐 mDNS (`dsh.local`)**: Встроенный responder UDP 5353 автоматически анонсирует имя `dsh.local` в LAN.
4. **🔐 Локальный Root CA и TLS**: Генерация собственного 10-летнего Root CA и серверных сертификатов с SAN (`dsh.local`, LAN IP). Роут `/dsh-lanmode/ca.crt` для доверия на смартфонах.
5. **🔔 Фоновые Web Push & Notifications API**: Уведомления об окончании ответа агента и запросах подтверждения при неактивной вкладке.
6. **🛡️ Безопасность и аутентификация**:
   - Пароли поддерживают открытый текст (plaintext) и scrypt хеши. Постоянное время проверки через `timingSafeEqual`.
   - Поддержка LAN PIN: открытый текст и `PBKDF2`-растягивание ключа (`pbkdf2$sha512$100000$salt$hash`). Блокировка перебора на 15 минут после 5 неудачных попыток.
   - Токены устройств и сессий защищены `SHA-256` хешированием перед сохранением в реестре.
   - Разделение ролей подсетей (`adminAllow`, `guestAllow`). Гости изолированы от настроек.
7. **☁️ Cloudflare WAN и Tailscale Funnel**:
   - Поддерживаются временные `Quick Tunnels` (trycloudflare.com) и постоянные `Named Tunnels` с токеном.
   - Опция `tunnelPin` требует ввод LAN PIN для запросов через Cloudflare туннель.
   - 1-клик интеграция с `Tailscale Funnel` с автоматическими доверенными сертификатами Let's Encrypt.
8. **📱 Управление устройствами**: Реестр подключённых устройств, отслеживание сессий и отзыв в один клик.

---

## 📦 Установка

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

---

## ⚙️ Конфигурация (`cordis.patch.yml`)

```yaml
- id: dsh-lanmode
  config:
    mode: direct             # direct, proxy или auto
    directHost: 0.0.0.0
    directPort: 3080
    mdns: true               # dsh.local
    pwa: true
    tls: self-signed
    unlockPrivileged: true
    lanPinRef: ""
    tunnel: off              # off, quick или named
    tunnelTokenRef: ""
    tunnelPin: true
    tailscaleFunnel: false
    allow:
      - 192.168.0.0/16
      - 10.0.0.0/8
    passwordAuth: false
    authPasswordRef: ""
    adaptiveCompression: true
```

---

## 📄 Лицензия

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
