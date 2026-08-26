// Сертификат должен переживать перезапуск: набор имён в нём — стабильный.
import assert from 'node:assert/strict'
import os from 'node:os'
import test from 'node:test'

import { localAddresses, stillGood } from '../lib/tls.js'

/** Подменить список интерфейсов на время одной проверки. */
function withInterfaces(fake, body) {
  const real = os.networkInterfaces
  os.networkInterfaces = () => fake
  try {
    return body()
  } finally {
    os.networkInterfaces = real
  }
}

const REAL_NIC = { address: '192.168.1.111', internal: false }
const LINK_LOCAL = { address: 'fe80::2e0:4cff:fe56:34f0', internal: false }

test('адреса докера в список не попадают', () => {
  const hosts = withInterfaces(
    {
      enp1s0: [REAL_NIC, LINK_LOCAL],
      'br-4f2a91': [{ address: '172.28.0.1', internal: false }],
      veth9c1d: [{ address: 'fe80::b856:a9ff:fe09:67c9', internal: false }],
      docker0: [{ address: '172.17.0.1', internal: false }],
    },
    localAddresses,
  )
  assert.ok(hosts.includes('192.168.1.111'), 'настоящий адрес машины нужен')
  assert.ok(hosts.includes('127.0.0.1'), 'петля нужна')
  assert.equal(hosts.some((h) => h.startsWith('fe80')), false, 'связь-локальные не нужны')
  assert.equal(hosts.includes('172.28.0.1'), false, 'мост докера не нужен')
  assert.equal(hosts.includes('172.17.0.1'), false, 'docker0 не нужен')
})

test('поднятый контейнер не делает сертификат негодным', () => {
  const before = withInterfaces({ enp1s0: [REAL_NIC] }, localAddresses)
  const info = {
    validTo: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000),
    fingerprint: 'AA:BB',
    names: before,
  }
  // Тот же момент времени, но контейнер уже поднялся и завёл свою пару.
  const after = withInterfaces(
    {
      enp1s0: [REAL_NIC],
      veth0ab12: [{ address: 'fe80::1c2d:3eff:fe45:6789', internal: false }],
      'br-99ff01': [{ address: '172.30.0.1', internal: false }],
    },
    localAddresses,
  )
  assert.deepEqual(after, before, 'список адресов не должен зависеть от контейнеров')
  assert.equal(stillGood(info, after, Date.now()), true, 'перевыпуск не нужен')
})

test('истёкший срок по-прежнему требует перевыпуска', () => {
  const hosts = withInterfaces({ enp1s0: [REAL_NIC] }, localAddresses)
  const expiring = {
    validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
    fingerprint: 'AA:BB',
    names: hosts,
  }
  assert.equal(stillGood(expiring, hosts, Date.now()), false)
})
