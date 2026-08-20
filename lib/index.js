// dsh-lanmode — хост-половина.
//
// Задача плагина: вернуть настройки на страницах, открытых не с localhost.
//
// Веб-интерфейс решает это в браузере, по имени хоста страницы:
//
//   isLoopback: pageLocation === undefined || isLoopbackHostname(hostname)
//
// где своими считаются только localhost, [::1] и 127.0.0.0/8. Дальше сервис
// настроек уходит в режим «памяти»: общий вид документа не читается никогда,
// каждый раздел получает статус "unavailable", запись выбрасывается до
// отправки. Внешне — пустые карточки всех плагинов, пустая вкладка «Настройки
// плагинов» и страница «Модели» с надписью
// "settings are unavailable in this browser".
//
// Сервер это ограничение не разделяет: settings.describe и settings.mutate по
// сети отвечают штатно, когда Origin совпадает с адресом страницы, — то есть
// ровно в том случае, когда запрос шлёт сам интерфейс.
//
// Поэтому плагин вставляет в index.html короткий скрипт (через официальную
// точку webServer.tapIndex) и подменяет флаг ТОЧЕЧНО — только для двух
// настроечных пакетов ядра. Флаг читают трое, и третьему подменять нельзя:
// в результатах работы isLoopback решает, можно ли открыть файл локально, и
// с подменой браузер просил бы открыть путь на машине сервера.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-lanmode'
export const inject = ['webServer']

const here = path.dirname(fileURLToPath(import.meta.url))

/** Скрипт-заплатка читается с диска: так его видно и правится он как код. */
function shimSource() {
  return readFileSync(path.join(here, 'shim.js'), 'utf8')
}

export function apply(ctx) {
  const script = '<script data-dsh-lanmode="1">' + shimSource() + '</script>'

  ctx.effect(() => ctx.webServer.tapIndex((html) => {
    if (html.includes('data-dsh-lanmode')) return html
    // Сразу за <head>: к моменту, когда страница начнёт грузить бандлы,
    // перехватчик уже стоит. Загрузчик к этому моменту может ещё не
    // существовать — заплатка это учитывает.
    const at = html.indexOf('<head>')
    if (at === -1) return script + html
    return html.slice(0, at + '<head>'.length) + script + html.slice(at + '<head>'.length)
  }), 'dsh-lanmode: вставка заплатки в index.html')
}
