// Автовыбор режима.
//
// Режим сейчас выставляется руками, а при переезде о нём забывают. Ошибка в обе
// стороны неприятна: лишний слушатель на занятом порту или его отсутствие там,
// где он нужен.
//
// Определяем по одному признаку: отвечает ли что-нибудь на сетевом адресе этой
// машины по порту харнесса. Харнесс слушает только петлю, поэтому ответ оттуда
// означает, что сеть уже обслуживает кто-то другой, — то есть прокси.
//
// Правило простое и осознанно осторожное: не удалось выяснить — считаем, что
// прокси есть, и ничего не поднимаем. Лишний слушатель на сетевом адресе — это
// открытая дверь, и заводить её по догадке нельзя.
//
// Чего эта проверка не умеет: заметить прокси, который слушает ДРУГОЙ порт.
// Такой случай неотличим снаружи от «никого нет», и для него режим задаётся
// руками. Так и написано в описании плагина.

import net from 'node:net'

/** Отвечает ли кто-нибудь по этому адресу и порту. */
function knock(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (answer) => {
      socket.removeAllListeners()
      try { socket.destroy() } catch (already) { /* уже мертво */ }
      resolve(answer)
    }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.on('connect', () => done(true))
    socket.on('error', () => done(false))
  })
}

/** Свой ли это адрес: петля отвечает всегда и для проверки не годится. */
export function isLoopback(address) {
  const clean = String(address).trim()
  return clean === 'localhost' || clean === '::1' || clean === '[::1]' || /^127\./.test(clean)
}

/**
 * Годится ли адрес для опроса.
 *
 * Связь-локальные адреса (fe80::) отбрасываются: без указания интерфейса к ним
 * не подключиться, а с ним они всё равно ничего не говорят о том, обслуживает
 * ли кто-то сеть.
 */
export function worthAsking(address) {
  const clean = String(address ?? '').trim()
  if (!clean || isLoopback(clean)) return false
  if (/^fe80:/i.test(clean)) return false
  if (/^169\.254\./.test(clean)) return false
  // Имя машины опрашивать незачем: оно разрешается в один из тех же адресов.
  return /^[0-9.]+$/.test(clean) || clean.includes(':')
}

/**
 * Выбрать режим.
 *
 * Все адреса опрашиваются разом: их у машины бывает под сотню, и опрос по
 * одному с ожиданием превращает выбор режима в минуты молчания при старте.
 *
 * @param options {{addresses: string[], port: number, directPort?: number,
 *                  timeoutMs?: number, probe?: Function}}
 * @returns `{ mode: 'proxy'|'direct', reason: string }`
 */
export async function detectMode(options) {
  const probe = options.probe ?? knock
  const timeoutMs = options.timeoutMs ?? 1000
  const addresses = (options.addresses ?? []).filter(worthAsking)

  if (!options.port) {
    return { mode: 'proxy', reason: 'порт харнесса неизвестен — ничего не поднимаю' }
  }
  if (addresses.length === 0) {
    return { mode: 'proxy', reason: 'сетевых адресов не нашлось — ничего не поднимаю' }
  }

  let answers
  try {
    answers = await Promise.all(addresses.map((address) => probe(address, options.port, timeoutMs)))
  } catch (failed) {
    return {
      mode: 'proxy',
      reason: 'проверить не удалось (' + String(failed.message || failed) + ') — ничего не поднимаю',
    }
  }

  const busy = addresses.filter((address, index) => answers[index])
  if (busy.length) {
    return {
      mode: 'proxy',
      reason: 'по адресу ' + busy[0] + ':' + options.port + ' уже кто-то отвечает — сеть обслуживают без меня',
    }
  }

  // Свой порт уже занят — поднимать нечего, и молчать об этом нельзя: иначе
  // человек будет искать, почему по нему отвечает не то, что он ждёт.
  if (options.directPort) {
    let taken = false
    try {
      taken = await probe('127.0.0.1', options.directPort, timeoutMs)
    } catch (unknown) {
      taken = false
    }
    if (taken) {
      return {
        mode: 'proxy',
        reason: 'порт ' + options.directPort + ' уже занят — свой слушатель не поднимаю',
      }
    }
  }

  return {
    mode: 'direct',
    reason: 'на ' + addresses.length + ' сетевых адресах по порту ' + options.port
      + ' никто не отвечает — поднимаю свой слушатель',
  }
}
