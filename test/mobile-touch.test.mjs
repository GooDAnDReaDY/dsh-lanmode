import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mobileStyles } from '../lib/mobile-styles.js'

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

test('Блок 1: #40 Подавление паразитного авто-фокуса в shim.js', () => {
  const shim = readFileSync(path.join(here, '..', 'lib', 'shim.js'), 'utf8')
  assert.ok(shim.includes('suppressFocus'), 'в shim.js должен быть механизм suppressFocus')
  assert.ok(shim.includes('isTouchDevice'), 'в shim.js должна быть детекция touch устройства')
})
