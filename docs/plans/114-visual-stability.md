# План реализации: Issue #114 — Унификация визуального стиля по стандарту dsh-clinebot и комплексная оптимизация стабильности

**Ветка**: `feat/114-visual-stability`
**Worktree**: `.worktrees/feat-114-visual-stability`
**Статус**: Завершено

## 1. Цели
1. **Визуальная унификация карточки настроек (эталон `dsh-clinebot`)**:
   - Внедрение `ErrorBoundary` в `lib/client.js` для перехвата любых ошибок в React-дереве и исключения краша вкладки настроек DSH.
   - Использование классов и токенов дизайн-системы DSH:
     - `.lm-page` / `.lm-section-card`: блочные секции с закруглением `12px`, бордером `--dsw-alias-border-l2`, фоном `--dsw-alias-bg-layer-3`.
     - Заголовки `.lm-section-title` и подзаголовки `.lm-section-desc`.
     - Бейджи `.lm-badge` с цветовыми классами `--dsw-alias-state-success-primary`, `--dsw-alias-state-warning-primary`, `--dsw-alias-state-error-primary`.
     - Инпуты `.lm-input` (`height: 36px`, `bg-layer-2`, фокус на `--dsw-alias-state-brand-primary`).
     - Кнопки `.lm-btn`, `.lm-btn-primary`, `.lm-btn-danger`, `.lm-btn-disabled`.
     - Алерт-боксы `.lm-alert-ok`, `.lm-alert-bad`, `.lm-banner-warning`.
   - Реактивная подписка на `settingsScope` с безопасной обработкой `loading` и `unavailable`.
2. **Анализ стабильности и оптимизация кодовой базы**:
   - Покрытие тестами непокрытых критических веток:
     - `lib/bridge.js`: авторизация WebSocket и проверка отозванных устройств на сокетах;
     - `lib/mdns.js`: запуск респондера `startMdnsResponder` с парсингом запросов и сборкой ответов;
     - `lib/tls.js`: обработка создания корневого CA и проверки истечения сертификатов.
   - Проверка и устранение слепых `catch (_) {}`.
3. **Верификация**:
   - 100% прохождение всего тестового набора (`npm test`).
   - Проверка размера пакета (`npm pack --dry-run`).

## 2. Результаты выполнения
- **ErrorBoundary**: Добавлен нативный React class component ErrorBoundary с componentDidCatch и getDerivedStateFromError, предотвращающий краш интерфейса и выводящий карточку ошибки с кнопкой повтора.
- **Дизайн-токены DSH**: Карточка LanModeCard (lib/client.js) полностью обновлена с нативными классами .lm-form-box, .lm-section-card, .lm-section-title, .lm-section-desc, .lm-btn-primary, .lm-badge-ok/warn/bad на токенах --dsw-alias-....
- **Надежность потоков**: В lib/bridge.js добавлены обработчики stream.on('error') и es.on('close') для brotli/gzip сжатия.
- **Ограничение реестра устройств**: В lib/devices.js метод 	ouch() теперь ограничивает емкость до 200 устройств с вытеснением устаревших по lastSeenAt.
- **Тестовое покрытие**: Добавлен тест 	est/audit-stability-114.test.mjs (5 комплексных тестов).
- **Итог тестирования**: 162/162 тестов успешно пройдено (100% pass, 0 fail).
