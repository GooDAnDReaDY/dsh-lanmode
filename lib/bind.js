// Выбор адреса для слушателя прямого режима.
//
// Отдельным модулем, потому что проверки не должны тянуть за собой харнесс:
// точка входа импортирует схему настроек, а её в рабочей копии нет.

import { localAddresses } from './tls.js'

/**
 * На каких адресах слушать.
 *
 * Харнесс уже занимает свой порт на петле, поэтому «все адреса» на том же порту
 * не поднимутся вовсе: получится EADDRINUSE, и плагин молча не заработает. В
 * этом случае привязываемся к сетевым адресам машины поимённо — привычный порт
 * сохраняется, столкновения нет.
 */
export function bindAddresses(config, harnessPort) {
  const wanted = String(config.directHost || '0.0.0.0')
  const port = config.directPort || 3088
  const everywhere = wanted === '0.0.0.0' || wanted === '::' || wanted === ''
  if (!everywhere || port !== harnessPort) return { hosts: [wanted], shared: false }

  const own = localAddresses().filter((address) => {
    if (address === 'localhost' || address === 'dsh.local' || address.endsWith('.local')) return false
    if (/^127\./.test(address) || address === '::1' || address === '[::1]') return false
    return true
  })
  if (own.length === 0) return { hosts: [wanted], shared: false }
  return { hosts: own, shared: true }
}
