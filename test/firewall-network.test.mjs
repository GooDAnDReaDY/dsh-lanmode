import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensurePortAllowed } from '../lib/firewall.js'
import { isWsl, wslHostAddress, isTailscaleAddress, localAddresses } from '../lib/tls.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Блок 5: #58 Определение физического IP хоста в WSL2', () => {
  assert.equal(typeof isWsl(), 'boolean', 'isWsl должен возвращать boolean')
  // Если не WSL, wslHostAddress возвращает null, если WSL — IP
  const addr = wslHostAddress()
  if (isWsl()) {
    assert.ok(addr && addr.split('.').length === 4, 'в WSL должен находиться IP хоста')
  } else {
    assert.equal(addr, null, 'вне WSL должен возвращаться null')
  }
})

test('Блок 5: #62 Определение Tailscale CGNAT диапазона 100.64.0.0/10', () => {
  assert.equal(isTailscaleAddress('100.64.0.1'), true, '100.64.0.1 входит в Tailscale')
  assert.equal(isTailscaleAddress('100.64.0.28'), true, '100.64.0.28 входит в Tailscale')
  assert.equal(isTailscaleAddress('100.127.255.254'), true, '100.127.255.254 входит в Tailscale')
  assert.equal(isTailscaleAddress('100.128.0.1'), false, '100.128.0.1 НЕ входит в Tailscale')
  assert.equal(isTailscaleAddress('192.168.1.1'), false, '192.168.1.1 обычный LAN')
  assert.equal(isTailscaleAddress('127.0.0.1'), false, 'петля')
})

test('Блок 5: #59 & #60 Управление фаерволом ОС ensurePortAllowed', async () => {
  const res = await ensurePortAllowed(3088)
  assert.ok(res && typeof res.open === 'boolean', 'должен возвращать статус open')
  assert.ok(typeof res.platform === 'string', 'должен возвращать платформу')
})

test('Блок 5: #61 Доступность сетевых интерфейсов в localAddresses', () => {
  const addrs = localAddresses()
  assert.ok(addrs.includes('127.0.0.1'), 'петля присутствует')
  assert.ok(addrs.includes('dsh.local'), 'dsh.local присутствует')
  assert.ok(addrs.length >= 2, 'список адресов не пуст')
})

test('Блок 5: #63 Регистрация диагностического эндпоинта probe в index.js', () => {
  const indexSource = readFileSync(path.join(here, '..', 'lib', 'index.js'), 'utf8')
  assert.ok(indexSource.includes('/dsh-lanmode/probe'), 'должен быть зарегистрирован путь /dsh-lanmode/probe')
  assert.ok(indexSource.includes('probeResult'), 'должен формироваться результат probeResult')
})
