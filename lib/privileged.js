// Привилегированные вызовы харнесса и опциональный контроль по PIN-коду.
//
// Часть методов ядро намеренно держит на петле: настройки, учётные данные,
// наборы агента, открытие путей на машине, опрос моделей. Забор у них строже
// обычного — он пропускает только клиента, пришедшего с петли.
//
// Мост переписывает Host и Origin на петлю. Чтобы защитить сервер от нежелательных
// изменений из локальной сети, плагин поддерживает:
// 1. unlockPrivileged (вкл/выкл) — общий переключатель доступа.
// 2. lanPin — опциональный PIN-код (например, 4-6 цифр), запрашиваемый для
//    привилегированных API от удалённых клиентов.

export const PRIVILEGED = [
  /^\/api\/settings\.(describe|openDocument|update|replace|mutate)$/,
  /^\/api\/credentials\.(describe|set|unset)$/,
  /^\/api\/agentPreset\.(read|copy|openDocument|remove)$/,
  /^\/api\/host\.(pickDirectory|openPath)$/,
  /^\/api\/llm\.discoverModels$/,
]

/** Привилегированный ли это путь. */
export function isPrivileged(url, extra) {
  const path = String(url ?? '').split('?')[0]
  if (!path) return false
  for (const rule of PRIVILEGED) if (rule.test(path)) return true
  for (const rule of extra ?? []) {
    try {
      if (new RegExp(rule).test(path)) return true
    } catch (badPattern) {
      // Кривое выражение в настройках не должно ронять мост
    }
  }
  return false
}

/** Проверить PIN-код из заголовков или cookie. */
export function verifyLanPin(headers, expectedPin) {
  if (!expectedPin || typeof expectedPin !== 'string' || expectedPin.trim() === '') return true
  const target = expectedPin.trim()

  const pinHeader = headers?.['x-dsh-lan-pin']
  if (pinHeader && String(pinHeader).trim() === target) return true

  const cookies = String(headers?.cookie ?? '')
  const match = cookies.match(/(?:^|;\s*)dsh_lan_pin=([^;]+)/)
  if (match && decodeURIComponent(match[1]).trim() === target) return true

  return false
}

/** Что сказать человеку, когда обход выключен, а вызов пришёл. */
export const REFUSED = 'dsh-lanmode: этот вызов ядро держит на петле. '
  + 'Включите unlockPrivileged, если сознательно открываете настройки и ключи сети.'

export const PIN_REQUIRED = 'dsh-lanmode: требуется авторизация по PIN-коду (x-dsh-lan-pin или cookie dsh_lan_pin) '
  + 'для доступа к привилегированным настройкам.'
