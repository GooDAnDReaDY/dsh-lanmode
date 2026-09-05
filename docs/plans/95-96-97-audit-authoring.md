# План реализации: Комплексное устранение замечаний аудита (#95, #96, #97)

## Контекст и цели
Автоматический аудит плагинов DSH выявил 3 замечания по разработке и качеству dsh-lanmode:
1. **Issue #97**: Утечка слушателей событий turn/end, approval/asked, visibilitychange, focus в клиенте из-за отсутствия регистрации в ctx.effect и возврата функций очистки.
2. **Issue #96**: Хранение секретов tunnelToken и lanPin в открытом виде в схеме Config вместо использования ссылок на сервис учетных данных (credentials).
3. **Issue #95**: Поля конфигурации Config (mode, port, tls, allow, unlockPrivileged) не вынесены для редактирования в карточку settings.plugin.item через реактивный ctx.settingsScope.

## Архитектура решения

### Блок 1. Issue #97 (Устранение утечки слушателей в lib/client.js)
- В функции apply(ctx) объединить все подписки на события в единый эффект.
- Использовать ctx.effect(() => disposeFn, "dsh-lanmode-listeners") при наличии ctx.effect.
- При вызове функции очистки отписывать все слушатели ядра и удалять обработчики DOM (document.removeEventListener, window.removeEventListener).

### Блок 2. Issue #96 (Поддержка ссылок на credentials в lib/index.js)
- Добавить в Config поля ссылок на учетные данные:
  - lanPinRef: ссылка на имя учетной записи в credentials или переменную окружения.
  - tunnelTokenRef: ссылка на имя токена Cloudflare tunnel в credentials или переменную окружения.
- Пометить существующие поля lanPin и tunnelToken как устаревшие (Deprecated), сохранив полную обратную совместимость.
- Реализовать функцию resolveSecret(ref, fallback) с безопасным обращением к ctx.credentials.resolve.
- Поддержать optional injection credentials в lib/index.js.

### Блок 3. Issue #95 (Привязка полей Config к settings.plugin.item в lib/client.js)
- Экспортировать module.exports.inject = ["slots", "locale", "settingsScope"].
- В LanModeCard:
  - Привязаться к пространству dsh-lanmode через ctx.settingsScope.bind({ namespace: NS }).
  - Отслеживать статус снимка: loading, unavailable, ready.
  - Предоставить форму редактирования полей: mode, port, tls, allow, unlockPrivileged.
  - Реализовать сохранение с валидацией и записью всех измененных полей (scope.set).
  - Отображать понятную обратную связь (успех / ошибка сохранения).

### Блок 4. Тесты и документация
- Написать модульные тесты для всех 3 блоков.
- Актуализировать docs/design/DESIGN.md, README.md, README.ru.md.
