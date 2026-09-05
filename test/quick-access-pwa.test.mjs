import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateAsciiQR } from '../lib/qr.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Блок 3: #35 Генерация компактного ASCII QR-кода для терминала', () => {
  const ascii = generateAsciiQR('http://dsh.local:3088')
  assert.ok(typeof ascii === 'string', 'должен возвращать строку')
  assert.ok(ascii.includes('█') || ascii.includes('▀') || ascii.includes('▄'), 'должен содержать символы блоков')
  assert.ok(ascii.split('\n').length > 5, 'должен быть многострочным')
})

test('Блок 3: #33 & #34 Регистрация QuickQrPopover и слота sidebar.footer.action в client.js', () => {
  const client = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')
  assert.ok(client.includes('sidebar.footer.action'), 'должен регистрироваться слот sidebar.footer.action')
  assert.ok(client.includes('QuickQrPopover'), 'должен объявляться компонент QuickQrPopover')
  assert.ok(client.includes('lm-modal-backdrop'), 'должен рендерить модальное окно с QR')
})

test('Блок 3: #36 Индикатор подключенного смартфона на десктопе', () => {
  const client = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')
  assert.ok(client.includes('Смартфон на связи'), 'должен содержать индикатор статуса смартфона')
})

test('Блок 3: #39/74 Расширенный манифест PWA и Splash Screen', () => {
  const indexSource = readFileSync(path.join(here, '..', 'lib', 'index.js'), 'utf8')
  assert.ok(indexSource.includes('apple-touch-icon'), 'должен подключаться apple-touch-icon')
  assert.ok(indexSource.includes('shortcuts'), 'в манифесте должны быть shortcuts')
  assert.ok(indexSource.includes('categories'), 'в манифесте должны быть categories')
  assert.ok(indexSource.includes('orientation'), 'в манифесте должна быть orientation')
})
