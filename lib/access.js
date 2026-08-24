// Кого пускать в прямом режиме.
//
// Пароля здесь нет и не будет: плагин чужие маршруты не перехватывает, а
// придумывать свой вход в харнесс — не его дело. Но между «без пароля» и «кто
// угодно из сети» есть промежуток, и список разрешённых адресов его занимает.
//
// Разбор записи CIDR свой, без зависимостей: адрес превращается в набор байтов,
// и сравниваются первые N бит. Для IPv4 и IPv6 это одна и та же арифметика,
// разной длины.

/** Байты адреса IPv4, или `null`, если это не он. */
function ipv4Bytes(text) {
  const parts = text.split('.')
  if (parts.length !== 4) return null
  const bytes = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    bytes.push(value)
  }
  return bytes
}

/**
 * Байты адреса IPv6, или `null`.
 *
 * Отдельно разбирается запись с хвостом IPv4 (`::ffff:192.168.1.5`): именно её
 * отдаёт Node для обычных подключений на сокете двойного стека, и без неё
 * список разрешённых адресов не сработал бы вовсе.
 */
function ipv6Bytes(text) {
  let body = text
  let tail = []
  const dot = body.lastIndexOf(':')
  if (body.includes('.')) {
    const four = ipv4Bytes(body.slice(dot + 1))
    if (!four) return null
    tail = four
    body = body.slice(0, dot + 1) + '0:0'
  }

  const halves = body.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : []
  if (halves.length === 1 && head.length !== 8) return null

  const groups = []
  for (const group of head) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
    groups.push(Number.parseInt(group, 16))
  }
  const restGroups = []
  for (const group of rest) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
    restGroups.push(Number.parseInt(group, 16))
  }
  const missing = 8 - groups.length - restGroups.length
  if (missing < 0) return null
  const all = halves.length === 2
    ? groups.concat(new Array(missing).fill(0), restGroups)
    : groups

  const bytes = []
  for (const group of all) bytes.push(group >> 8, group & 255)
  if (tail.length) {
    bytes.splice(12, 4, ...tail)
  }
  return bytes.length === 16 ? bytes : null
}

/** Байты адреса — или `null`, если разобрать не вышло. */
export function addressBytes(text) {
  const clean = String(text ?? '').trim()
  if (!clean) return null
  if (clean.includes(':')) return ipv6Bytes(clean)
  return ipv4Bytes(clean)
}

/**
 * Адрес IPv4, спрятанный внутри записи IPv6.
 *
 * `::ffff:192.168.1.5` — это тот же 192.168.1.5, и правило, написанное для
 * IPv4, обязано на него распространяться. Иначе список выглядит рабочим, а
 * пускает мимо.
 */
function unwrapped(bytes) {
  if (!bytes || bytes.length !== 16) return null
  for (let i = 0; i < 10; i++) if (bytes[i] !== 0) return null
  if (bytes[10] !== 255 || bytes[11] !== 255) return null
  return bytes.slice(12)
}

/**
 * Разобрать одну запись списка: адрес или подсеть в записи CIDR.
 *
 * @returns `{ bytes, bits }` или `null`, если запись непонятна.
 */
export function parseRule(text) {
  const clean = String(text ?? '').trim()
  if (!clean) return null
  const slash = clean.lastIndexOf('/')
  const address = slash === -1 ? clean : clean.slice(0, slash)
  const bytes = addressBytes(address)
  if (!bytes) return null

  const full = bytes.length * 8
  if (slash === -1) return { bytes, bits: full }
  const bits = Number(clean.slice(slash + 1))
  if (!Number.isInteger(bits) || bits < 0 || bits > full) return null
  return { bytes, bits }
}

/** Разобрать весь список, молча отбрасывая непонятные записи. */
export function parseAllow(list) {
  const rules = []
  const dropped = []
  for (const item of Array.isArray(list) ? list : []) {
    const rule = parseRule(item)
    if (rule) rules.push(rule)
    else if (String(item ?? '').trim()) dropped.push(String(item))
  }
  return { rules, dropped }
}

/** Совпадают ли первые `bits` бит. */
function samePrefix(left, right, bits) {
  if (left.length !== right.length) return false
  const whole = bits >> 3
  for (let i = 0; i < whole; i++) if (left[i] !== right[i]) return false
  const spare = bits & 7
  if (spare === 0) return true
  const mask = (255 << (8 - spare)) & 255
  return (left[whole] & mask) === (right[whole] & mask)
}

/**
 * Пускать ли этот адрес.
 *
 * Пустой список означает «никого не ограничиваем» — так плагин ведёт себя до
 * того, как список задали, и так же, если задали одну мусорную строку: тихо
 * запереть дверь из-за опечатки хуже, чем не запирать вовсе.
 */
export function allowed(address, rules) {
  if (!Array.isArray(rules) || rules.length === 0) return true
  const bytes = addressBytes(address)
  if (!bytes) return false
  const inner = unwrapped(bytes)

  for (const rule of rules) {
    if (samePrefix(bytes, rule.bytes, rule.bits)) return true
    if (inner && rule.bytes.length === 4 && samePrefix(inner, rule.bytes, rule.bits)) return true
  }
  return false
}
