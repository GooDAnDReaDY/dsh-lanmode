import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { localAddresses, altNames } from '../lib/tls.js'
import { bindAddresses } from '../lib/bind.js'
import { allowed, parseAllow } from '../lib/access.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Issue #78: Config содержит настройку mdnsName с дефолтом dsh.local', () => {
  const indexSrc = fs.readFileSync(path.join(here, '..', 'lib', 'index.js'), 'utf8')
  assert.ok(indexSrc.includes('mdnsName: z'), 'должно быть поле mdnsName в Config')
  assert.ok(indexSrc.includes(".default('dsh.local')"), 'значение по умолчанию dsh.local')
})

test('Issue #78: localAddresses и altNames включают произвольное mDNS имя для SAN сертификата', () => {
  const addrs = localAddresses('dsh-custom.local')
  assert.ok(addrs.includes('dsh-custom.local'), 'кастомное mDNS имя должно присутствовать в адресах')

  const san = altNames(['localhost', '192.168.1.50', 'dsh-custom.local'])
  assert.ok(san.includes('DNS:dsh-custom.local'), 'SAN сертификата обязан содержать кастомный DNS домен')
})

test('Issue #78: bindAddresses исключает любое .local имя из raw сокетов', () => {
  const res = bindAddresses({ directHost: '0.0.0.0', directPort: 3088 }, 3088)
  for (const host of res.hosts) {
    assert.equal(host.endsWith('.local'), false, `Хост ${host} не должен быть .local доменом`)
  }
})

test('Issue #78: Просеивание mDNS-анонса через allow (не объявлять адреса, куда не пускаем)', () => {
  const { rules } = parseAllow(['192.168.1.0/24'])
  const machineAddresses = ['192.168.1.111', '100.123.213.28', '172.17.0.1']

  const announced = machineAddresses.filter((ip) => allowed(ip, rules))
  assert.deepEqual(announced, ['192.168.1.111'], 'Должен быть объявлен только адрес подсети 192.168.1.0/24')
  assert.equal(announced.includes('100.123.213.28'), false, 'Адрес Tailscale должен быть отсеян')
})

test('Issue #78: Если allow исключил все адреса, анонс пуст (не анонсируем заведомо отвергаемый трафик)', () => {
  const { rules } = parseAllow(['10.50.0.0/16'])
  const machineAddresses = ['192.168.1.111', '100.123.213.28']

  const announced = machineAddresses.filter((ip) => allowed(ip, rules))
  assert.equal(announced.length, 0, 'Список адресов должен быть пустым')
})
