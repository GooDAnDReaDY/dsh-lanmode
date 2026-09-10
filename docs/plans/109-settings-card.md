# План реализации: Issue #109 — Проверить, все ли поля схемы доступны в карточке настроек

**Ветка**: `feat/109-settings-card`
**Worktree**: `.worktrees/research-109-settings-card`
**Статус**: Реализовано, тесты пройдены

## 1. Проблема и цели
В карточке настроек `LanModeCard` (`lib/client.js`) редактировались только 6 базовых полей (`mode`, `directPort`, `tls`, `allow`, `unlockPrivileged`, `lanPinRef`), тогда как схема `Config` (`lib/index.js`) содержит 31 поле конфигурации.
Цели:
1. Провести аудит всех 31 полей схемы `Config`.
2. Обеспечить редактирование всех пользовательских настроек (25 полей) в карточке `LanModeCard`.
3. Обосновать оставшиеся 6 полей (2 инфраструктурных поля `directHost`, `tlsDir` и 2 устаревших поля `lanPin`, `tunnelToken`).
4. Устранить прямые обращения к свойствам контекста Cordis (`ctx.settings`, `ctx.settingsScope`).
5. Добавить атрибут `data-dsh-plugin="dsh-lanmode"` к тегу стилей `<style>`.
6. Покрыть изменения автоматическими тестами.

## 2. Результаты аудита полей
- **25 полей формы в карточке настроек**:
  - Сетевой шлюз: `mode`, `directPort`, `streamTimeoutMs`, `privilegedExtra`
  - TLS и безопасность: `tls`, `tlsHosts`, `tlsCert`, `tlsKey`
  - LAN доступ: `lanPinRef`, `allow`, `unlockPrivileged`
  - Мобильный интерфейс и mDNS: `mdnsName`, `mdns`, `pwa`, `mobileEnterSends`, `diagnostics`
  - Полифиллы окружения: `settings`, `randomUuid`, `clipboard`
  - Аутентификация: `passwordAuth`, `authUser`, `authSessionDays`, `authPassword`, `authPasswordRef`
  - WAN туннель Cloudflare: `tunnel`, `tunnelTokenRef`, `tunnelPin`
- **2 инфраструктурных поля (host/profile-row only)**:
  - `directHost`: сетевой интерфейс привязки сокета (0.0.0.0). Фиксируется при загрузке процесса до гидратации настроек; изменение на лету без перезапуска процесса небезопасно.
  - `tlsDir`: путь к каталогу для сгенерированных Root CA сертификатов.
- **2 устаревших поля**:
  - `lanPin` (deprecated в пользу `lanPinRef`)
  - `tunnelToken` (deprecated в пользу `tunnelTokenRef`)

## 3. Выполненные изменения
1. `lib/index.js`: безопасное получение сервиса настроек через `(ctx.get?.('settings') || ctx.settings)`.
2. `lib/client.js`:
   - безопасное получение `(ctx.get?.('settingsScope') || ctx.settingsScope)`.
   - атрибут `data-dsh-plugin="dsh-lanmode"` для динамического `<style>`.
   - добавлены визуальные разделители секций `.lm-section-head` и `.lm-section-desc`.
   - расширены `draft` и `saveSettings` для сохранения всех 25 интерактивных полей через `scope.set()`.
   - форма структурирована на 7 логических блоков.
3. `test/audit-settings-card-109.test.mjs`: интеграционный тест проверки рендера и сохранения всех 25 полей в `LanModeCard`.
4. `docs/design/DESIGN.md`: зафиксировано архитектурное решение (Locked Design Decision) для Issue #109.

## 4. Верификация
- `npm test`: 156/156 тестов успешно пройдены (0 ошибок).
