import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { mobileNavSource } from '../lib/mobile-nav.js'

test('Issue #112: mobileNavSource не перехватывает Enter на десктопе и проверяет pointer: coarse', () => {
  const src = mobileNavSource()

  // 1. Проверяем отсутствие e.stopPropagation и перехвата keydown
  assert.ok(!src.includes('e.stopPropagation()'), 'Никаких вызовов stopPropagation() не должно быть')
  assert.ok(!src.includes("'keydown'"), 'mobile-nav не должен вешать обработчик на keydown')

  // 2. Проверяем точную эвристику: pointer: coarse и ширина экрана
  assert.ok(src.includes('pointer: coarse'), 'Должна использоваться медиа-проверка coarse pointer')
  assert.ok(src.includes('isTouchMobile'), 'Должна использоваться объединенная проверка touch и экрана')

  // 3. Симуляция десктопного браузера с окном < 1024px без тача
  let addEventListenerCalled = false
  const desktopContext = {
    window: {
      innerWidth: 800,
      matchMedia: (query) => ({ matches: query.includes('coarse') ? false : true }),
      addEventListener: () => { addEventListenerCalled = true },
      navigator: { maxTouchPoints: 0 },
    },
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      readyState: 'complete',
    },
    sessionStorage: { getItem: () => null },
  }

  vm.runInNewContext(src, desktopContext)
  assert.equal(addEventListenerCalled, false, 'На десктопе без touch/coarse pointer обработчики touchstart не должны вешаться')

  // 4. Симуляция реального мобильного устройства
  let touchListenerAdded = false
  const mobileContext = {
    window: {
      innerWidth: 414,
      matchMedia: (query) => ({ matches: query.includes('coarse') ? true : false }),
      addEventListener: (evt) => {
        if (evt === 'touchstart' || evt === 'touchend') touchListenerAdded = true
      },
      navigator: { maxTouchPoints: 5 },
    },
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      readyState: 'complete',
      body: { appendChild: () => {} },
      createElement: () => ({ setAttribute: () => {}, style: {} }),
    },
    sessionStorage: { getItem: () => null },
  }

  vm.runInNewContext(src, mobileContext)
  assert.equal(touchListenerAdded, true, 'На мобильном с coarse pointer слушатели жестов должны активироваться')
})
