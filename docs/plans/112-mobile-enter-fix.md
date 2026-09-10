# План реализации: Issue #112 — Предотвращение ложной мобильной классификации и защита десктопного Enter (GitHub #1)

**Ветка**: `fix/112-mobile-enter-detection`
**Worktree**: `.worktrees/fix-112-mobile-enter-detection`
**Статус**: Реализовано, тесты пройдены

## 1. Проблема
Внешний баг-репорт GitHub Issue #1 от пользователя `luxi233`:
В версиях до v0.7.9 перехватчик Enter (`e.stopPropagation()`) при `mobileEnterSends: false` блокировал отправку сообщений в Lexical редакторе DSH на десктопных компьютерах, определяя их как мобильные по грубой эвристике `window.innerWidth < 1024` или `maxTouchPoints > 0`.
Хотя сам перехват `e.stopPropagation()` был удален в рамках оптимизации #100 (коммит `03933b5`), грубая классификация устройств в `lib/mobile-nav.js` сохранялась, а мертвые переменные `options.mobileEnterSends` засоряли код.

## 2. Что сделано
1. `lib/mobile-nav.js`:
   - Удалены мертвые переменные `options.mobileEnterSends` и `enterSends`.
   - Обновлена проверка мобильного контекста: теперь используется точный CSS медиа-запрос `window.matchMedia('(pointer: coarse)').matches` в сочетании с шириной экрана `window.innerWidth < 1024`.
   - Десктопы с incidental touch-панелями и узкие окна мышиных десктопов больше не квалифицируются как `isTouchMobile`.
2. `test/audit-mobile-enter-112.test.mjs`:
   - Написан юнит-тест, подтверждающий:
     - полное отсутствие `e.stopPropagation()` и перехвата `keydown` в `mobile-nav`;
     - корректную фильтрацию десктопных окон < 1024px без coarse pointer;
     - сохранение работы жестов и FAB на реальных тач-устройствах.
3. `docs/design/DESIGN.md`:
   - Зафиксировано архитектурное решение (Locked Design Decision) для Issue #112.

## 3. Результаты проверок
- `npm test`: 157/157 тестов успешно пройдены (0 ошибок).
