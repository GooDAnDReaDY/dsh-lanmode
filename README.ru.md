# 📦 @goodandready/dsh-lanmode

<div align="center">

<h3>Доступ к веб-интерфейсу по локальной сети (LAN), mDNS (dsh.local), PWA, Root CA, QR-код, фоновые уведомления и авто-TLS для DeepSeek Harness</h3>

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

По умолчанию современные браузеры и DSH блокируют ключевой функционал при открытии по HTTP с IP локальной сети:
1. 🔒 **Блокировка настроек и моделей**: проверка `isLoopbackHostname` переводит настройки в режим «только чтение», карточки пустые.
2. 💥 **Падение генерации UUID**: `crypto.randomUUID()` требует безопасный контекст (HTTPS или localhost).
3. 📋 **Блокировка буфера обмена и микрофона**: `navigator.clipboard` и `getUserMedia` отключены на HTTP.
4. 🛡️ **Защита API ядра**: ядро DSH разрешает методы настроек только клиентам с петли `127.0.0.1`.

`dsh-lanmode` решает эти проблемы через полифиллы, TLS-мост, авто-mDNS, Root CA и клиентскую карточку настроек.

---

## ✨ Полный обзор возможностей

### 1. 📱 Поповер Quick QR, команда `/mobileqr` и мобильное подключение
* **Быстрый доступ Quick QR**: Иконка смартфона в подвале сайдбара (`sidebar.footer` / `sidebar.rail`) открывает интерактивный поповер с чистым SVG QR-кодом, переключением LAN / WAN и кнопкой копирования адреса.
* **Терминал и чат агента**: Инструмент `/mobileqr` в чате и вывод ASCII QR-кода прямо в stdout терминала при старте.
* **Диагностика**: Векторный QR-код доступен по маршруту `/dsh-lanmode/qr` и на странице `/dsh-lanmode/health`.

### 2. 📲 PWA и Standalone-режим
* Роут `/dsh-lanmode/manifest.json` и метатеги `viewport-fit=cover`, `apple-mobile-web-app-capable`, `theme-color`.
* Полноэкранный Standalone-режим на iOS/Android без адресной строки и с безопасными отступами под экранные вырезы.

### 3. 🌐 Автоматический mDNS (`dsh.local`)
* Встроенный responder на UDP 5353: анонсирует имя **`dsh.local`** в локальной сети.

### 4. 🔐 Локальный Root CA для постоянного доверенного HTTPS
* Связка **`dsh-lanmode Local Root CA`** (10 лет) $\rightarrow$ **`Server Certificate`** (SAN для `dsh.local`, LAN IP и localhost).
* Маршрут `GET /dsh-lanmode/ca.crt` для установки сертификата на мобильные устройства. Поддержка SNI через `tlsSites`.

### 5. 🔔 Фоновые системные уведомления (Web Notifications API)
* Перехватывает события `turn/end` и `approval/asked`. При неактивной вкладке (`document.hidden`) отправляет системный push.

### 6. 🎨 Клиентская карточка в «Настройки → Плагины» (`lib/client.js`)
* Интерактивная карточка: статус подключения, копирование LAN URL, переключатель QR, тумблер уведомлений и ссылка на Root CA.

### 7. 🛡️ Контроль доступа, LAN PIN и безопасность
* **`unlockPrivileged`**: Шлюз для изменения настроек и секретов из локальной сети.
* **`lanPin` / `lanPinRef`**: Защита привилегированных операций PIN-кодом. LAN PIN поддерживает как plaintext, так и PBKDF2-хеширование (`pbkdf2$sha512$100000$salt$hash`) через `hashPin()`. Защита от перебора временно блокирует IP на 15 минут после 5 неудачных попыток подряд (HTTP 429).
* **Разделение ролей подсетей**: Правила `adminAllow` и `guestAllow`. Гостевые подсети не могут изменять системные настройки или отзывать сессии (`403 Forbidden`).
* **Защита маршрутов и лимиты**: Внутренние маршруты (`/dsh-lanmode/devices`, `/dsh-lanmode/tunnel`, `/dsh-lanmode/api/config`) защищены fail-closed авторизацией. `GET /dsh-lanmode/tunnel` требует подтверждения администратора. Запросы на вход, настройки и туннели ограничены 64 КиБ (HTTP 413).
* **Защита от CSRF**: POST-запросы отклоняют кросс-сайтовые вызовы (`Sec-Fetch-Site: cross-site`) и сверяют `Origin`/`Host`.
* **Хранение и проверка паролей**: Пароли поддерживают как открытый текст (для обратной совместимости), так и надежные дайджесты scrypt (`scrypt$16384$8$1$salt$hash`). Проверка выполняется в константном времени (`timingSafeEqual`), с фиктивным проходом scrypt для защиты от тайминг-атак. Смена пароля немедленно отзывает другие сессии пользователя.
* **Токены сессий и устройств**: Активные сессии и токены устройств хешируются через SHA-256 (`hashToken`); открытые токены никогда не сохраняются в реестре устройств (`dsh-lanmode-devices.json`) и его резервных копиях (`.bak`).
* **Атомарные резервные копии и Fail-Closed защита**: Резервные копии `.bak` создаются атомарно через временные файлы и переименование. При повреждении основного и резервного файлов включается защитный режим fail-closed (HTTP 403 для внешних адресов).
* **Динамическая ротация секретов**: Ссылки на секреты (`lanPinRef`, `authPasswordRef`, `tunnelTokenRef`) запрашиваются у провайдера контекста на каждую операцию без кеширования, мгновенно применяя изменения.
* **Локализация интерфейса**: Окно ввода LAN PIN динамически разрешает локализованные строки через клиентский словарь без вывода сырых ключей словаря.

### 8. 📱 Управление устройствами и активными сессиями
* Отслеживание присутствия клиентов и определение ОС/браузера (iOS, Android, Windows, macOS, Linux).
* Индивидуальный отзыв сессий устройств и кнопка экстренного сброса всех остальных сессий («Revoke All Others»).
* Маршруты моста для управления устройствами требуют доступа администратора (403 для гостей).

### 9. 🌐 Мульти-интерфейсы и обнаружение Mesh-сетей
* Автообнаружение сетевых адаптеров, Tailscale (100.x.y.z), WireGuard и VPN с кнопками быстрого выбора.
* Настройка брандмауэра для Windows Defender Firewall, Linux UFW и firewalld.

### 10. ⚡ Сетевая телеметрия и поддержка HTTP/2 ALPN
* Виджет телеметрии в реальном времени: задержка пинга (RTT), активные соединения и объем переданных данных.
* Поддержка протокола HTTP/2 (ALPN `h2`) на мосту наряду с HTTP/1.1 для мультиплексирования потоков.

### 11. 🚀 Изоляция пулов соединений HTTP и SSE-стриминга
* Исходящие соединения разделены на два пула: стандартный HTTP (до 100 сокетов Keep-Alive с таймаутом очереди) и выделенный стриминговый пул (SSE, `/api/chat/stream`). Потоки не блокируют статику, тело ответа стримится напрямую.

### 12. ☁️ Туннели Cloudflare WAN и Tunnel PIN
* **Быстрые Quick Tunnels и постоянные Named Tunnels**: Удаленный доступ через Cloudflare без проброса портов. Поддерживаются как временные Quick Tunnels (`trycloudflare.com`), так и постоянные именованные туннели через `tunnelToken` / `tunnelTokenRef`.
* **Защита запуска туннеля (Fail-Closed)**: Служба туннеля проверяет готовность слушателя моста и отказывается стартовать при сбое привязки или недоступности TLS, исключая утечку открытого порта ядра.
* **Проверка Tunnel PIN**: При настроенном `lanPin` (или `lanPinRef`) входящие HTTP-запросы и WebSocket-соединения через туннели Cloudflare требуют ввода LAN PIN (`tunnelPin: true`, включено по умолчанию). Если PIN не задан, туннель не требует ввода PIN.

### 13. 🔄 Обновление плагина в один клик из интерфейса
* Служба обновления в карточке настроек (`/api/dsh-lanmode/update`) с проверкой версий в npm и защищенным периметром.

---

## 📦 Быстрая установка

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

---

## ⚙️ Конфигурация (профиль `cordis.patch.yml`)

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: dsh-lanmode
  config:
    mode: direct             # direct, proxy или auto
    directHost: 0.0.0.0      # 127.0.0.1 по умолчанию
    directPort: 3080
    mdns: true               # dsh.local в LAN
    pwa: true                # PWA manifest
    tls: self-signed         # self-signed, files или off
    unlockPrivileged: true   # Настройки из LAN
    lanPinRef: ""            # Секрет LAN PIN
    tunnelTokenRef: ""       # Секрет туннеля
    allow:
      - 192.168.0.0/16
      - 10.0.0.0/8
    passwordAuth: false      # Парольная защита
    authPasswordRef: ""      # Секрет пароля
    publicHost: ""
    disabledUsers: []
    trustedProxyCidrs: []
    tlsSites: []
    adaptiveCompression: true
```

---

## 📄 Лицензия

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
