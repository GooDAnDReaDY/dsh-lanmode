import { clientRuntimeSource } from './client-bundle.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mobileStyles } from '../lib/mobile-styles.js'
import { mobileNavSource } from '../lib/mobile-nav.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Блок 1: #36 Anti-Zoom для iOS (font-size 16px)', () => {
  const css = mobileStyles()
  assert.ok(css.includes('font-size: 16px !important'), 'должно присутствовать правило 16px')
  assert.ok(css.includes('max-width: 1024px'), 'должно ограничиваться экранами до 1024px')
})

test('Блок 1: #37 Safe-Area insets для строки ввода', () => {
  const css = mobileStyles()
  assert.ok(css.includes('safe-area-inset-bottom'), 'должен учитываться safe-area-inset-bottom')
  assert.ok(css.includes('composerSeat'), 'селектор composerSeat должен присутствовать')
})

test('Блок 1: #38 Кликабельные зоны 44x44px на touch-устройствах', () => {
  const css = mobileStyles()
  assert.ok(css.includes('pointer: coarse'), 'должна быть проверка coarse pointer')
  assert.ok(css.includes('min-height: 44px'), 'min-height 44px')
  assert.ok(css.includes('min-width: 44px'), 'min-width 44px')
})

test('Блок 1: #45 Подавление залипающих ховер-тултипов на touch', () => {
  const css = mobileStyles()
  assert.ok(css.includes('hover: none'), 'должна быть проверка hover: none')
  assert.ok(css.includes('tooltip'), 'должно подавлять селекторы tooltip')
})

test('Блок 1: #40 Безопасный фокус без глобального monkey-patching в shim.js', () => {
  const shim = readFileSync(path.join(here, '..', 'lib', 'shim.js'), 'utf8')
  assert.ok(!shim.includes('HTMLElement.prototype.focus'), 'shim не должен ломать глобальный focus прототипа')
})

test('Блок 2: #39 Корректная обработка клавиш без блокировки Enter в mobile-nav.js', () => {
  const code = mobileNavSource()
  assert.ok(!code.includes('e.stopPropagation()'), 'mobile-nav не должен глушить нажатия клавиш')
})

test('Блок 2: #41 Скрытие второстепенных колонок без подавления чужих плагинов', () => {
  const css = mobileStyles()
  assert.ok(css.includes('max-width: 768px'), 'должно быть правило max-width: 768px')
  assert.ok(css.includes('detailsColumn'), 'должна скрываться detailsColumn')
  assert.ok(!css.includes('terminal'), 'чужой плагин terminal не должен скрываться насильно')
})

test('Блок 2: #42 Свайп жесты для сайдбара', () => {
  const code = mobileNavSource()
  assert.ok(code.includes('touchstart'), 'должен слушать touchstart')
  assert.ok(code.includes('touchend'), 'должен слушать touchend')
  assert.ok(code.includes('toggleSidebar'), 'должен управлять сайдбаром')
})

test('Блок 2: #43 Авто-схлопывание сайдбара при клике по сессии', () => {
  const code = mobileNavSource()
  assert.ok(code.includes('sessionItem'), 'должен отслеживать клики по sessionItem')
})

test('Блок 2: #44 Плавающая кнопка FAB для открытия сайдбара', () => {
  const code = mobileNavSource()
  assert.ok(code.includes('dsh-mobile-fab'), 'должен создавать элемент dsh-mobile-fab')
})

test('Блок 2: #72 Принудительно десктопный вид (force desktop)', () => {
  const code = mobileNavSource()
  assert.ok(code.includes('dsh_force_desktop'), 'должен проверять ключ dsh_force_desktop в sessionStorage')
  const client = clientRuntimeSource()
  assert.ok(client.includes('dsh_force_desktop'), 'в карточке настроек должен быть toggle dsh_force_desktop')
})

test('Блок 2: #73 Виброотклик на turn/end и approval/asked', () => {
  const client = clientRuntimeSource()
  assert.ok(client.includes('navigator.vibrate'), 'должен вызываться navigator.vibrate')
})

test('mobile stylesheet is owned by dsh-lanmode', () => {
  const css = mobileStyles()
  assert.ok(css.includes('data-dsh-plugin="dsh-lanmode"'), 'style tag must declare the plugin owner')
})

test('Issue #168: mobile styles use semantic CSS Module suffixes', () => {
  const css = mobileStyles()
  assert.ok(css.includes('[class$="_composerSeat"]'), 'composer uses suffix selector')
  assert.ok(css.includes('[class$="_detailsColumn"]') || css.includes('[class*="_detailsColumn"]'), 'details column uses suffix')
  assert.ok(!css.includes('[class*="composerSeat"]') || css.includes('[class$="_composerSeat"]'), 'hashed prefix alone is not required')
  const code = mobileNavSource()
  assert.ok(code.includes('_sessionItem') || code.includes('$="_sessionItem"'), 'session click uses suffix')
})

test('Issue #169: FAB remembers position and hides with an open sidebar', () => {
  const code = mobileNavSource()
  assert.ok(code.includes('dsh_lanmode_fab_pos'), 'position key is stored')
  assert.ok(code.includes('localStorage'), 'uses localStorage')
  assert.ok(code.includes('pointerdown'), 'supports drag')
  assert.ok(code.includes('isPortraitMobile') || code.includes('innerHeight'), 'portrait gate')
  assert.ok(code.includes('sidebarLooksOpen') || code.includes('applyFabVisibility'), 'hides when sidebar open')
})

test('Issue #173: programmatic focus without a gesture is blurred on mobile', () => {
  const code = mobileNavSource()
  assert.ok(code.includes('focusin'), 'listens for focusin')
  assert.ok(code.includes('lastUserGestureAt'), 'tracks user gestures')
  assert.ok(code.includes('.blur()'), 'blurs unsolicited focus')
  assert.ok(!/HTMLElement\.prototype\.focus\s*=/.test(code), 'does not patch focus')
})

test('Issue #204: fullscreen right panel clears the mobile header', () => {
  const css = mobileStyles()
  assert.ok(css.includes('--dsh-mobile-header-h'))
  assert.ok(css.includes('data-sidebar-right-panel'))
  assert.ok(css.includes('top: var(--dsh-mobile-header-h)'))
})

test('Issue #214: mobile nav watches late frames with MutationObserver', () => {
  const src = mobileNavSource()
  assert.ok(src.includes('MutationObserver'))
  assert.ok(src.includes('data-dsh-mobile-ready'))
  assert.ok(src.includes('APP_FRAME_SELECTOR') || src.includes('_app'))
})

test('Issue #175: mobile CSS hides heavy desktop plugin surfaces', () => {
  const css = mobileStyles()
  assert.ok(css.includes('data-dsh-plugin*="terminal"'))
  assert.ok(css.includes('git-graph'))
  const nav = mobileNavSource()
  assert.ok(nav.includes('hideHeavyDesktop'))
  assert.ok(nav.includes('closeDetails'))
})
