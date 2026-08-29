// Проверка точек крепления.
//
// Плагин чинит чужое поведение и держится за внутренности харнесса: за точку
// вставки в index.html, за то, что вставка доезжает до отдаваемой страницы, и
// за имя пакета, который заплатка обязана обходить стороной. Любая из точек
// может уехать с обновлением ядра.
//
// Так уже было: подмена доходила до настроек ядра, но не до разделов плагинов,
// и это выяснилось не сразу, а через несколько дней жалоб на пустые карточки.
// Тихий отказ здесь хуже поломки — поэтому плагин проверяет свои допущения сам
// и жалуется громко.

/** Пакет, которому заплатка обязана оставлять настоящий ответ. */
export const EXCLUDED_BUNDLE = '@deepseek-ai/dsh-client-ui-deliverables'

/** Один вывод проверки. */
function verdict(name, ok, detail) {
  return { name, ok, detail }
}

/**
 * Проверить всё, что можно проверить со стороны хоста.
 *
 * Со стороны браузера проверяет страница диагностики: то, что происходит в нём,
 * отсюда не видно, а гадать — то же самое, что не проверять.
 *
 * @param options {{webServer: object, fetchIndex: () => Promise<string>}}
 */
export async function checkAssumptions(options) {
  const results = []
  const webServer = options.webServer

  results.push(verdict(
    'точка вставки в index.html',
    Boolean(webServer && typeof webServer.tapIndex === 'function'),
    'webServer.tapIndex — то, чем плагин вставляет заплатку на страницу',
  ))

  results.push(verdict(
    'порт харнесса известен',
    Boolean(webServer && webServer.port),
    'webServer.port — без него не поднять прямой режим и не проверить, кто слушает сеть',
  ))

  let page = { status: 0, html: '' }
  try {
    page = await options.fetchIndex()
  } catch (unreachable) {
    results.push(verdict('страница отдаётся', false, String(unreachable.message || unreachable)))
    return results
  }

  // Харнесс может потребовать токен и ответить отказом. Тело отказа — не
  // страница интерфейса, и искать в нём заплатку бессмысленно: получилось бы
  // уверенное «её нет» там, где мы просто не смотрели.
  if (page.status && page.status !== 200) {
    results.push(verdict(
      'страница отдаётся нам',
      false,
      'харнесс ответил ' + page.status + ' на запрос по петле без токена — проверить страницу отсюда нельзя. '
        + 'Это не поломка плагина: заплатка могла встать, но увидеть её мы не можем',
    ))
    return results
  }

  const html = page.html

  results.push(verdict(
    'заплатка попала на страницу',
    html.includes('data-dsh-lanmode'),
    'если её там нет, всё остальное не имеет значения',
  ))

  results.push(verdict(
    'исключение на месте',
    html.includes(EXCLUDED_BUNDLE),
    'пакет ' + EXCLUDED_BUNDLE + ' обходится стороной, потому что решает, можно ли '
      + 'открыть файл локально. Исчез или переименован — исключение больше ничего не исключает',
  ))

  return results
}

/** Свести проверки в одну строку для журнала. */
export function summarize(results) {
  const bad = results.filter((item) => !item.ok)
  if (bad.length === 0) return 'точки крепления на месте: ' + results.length + ' из ' + results.length
  return 'ТОЧКИ КРЕПЛЕНИЯ УЕХАЛИ (' + bad.length + ' из ' + results.length + '): '
    + bad.map((item) => item.name).join('; ')
    + '. Плагин может работать не так, как задумано. Что именно не сошлось — в списке выше; '
    + 'ядро при этом может быть совершенно исправным'
}
