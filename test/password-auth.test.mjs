import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AuthManager, makeSessionCookie, clearSessionCookie } from '../lib/auth.js'
import { renderLoginPage } from '../lib/login-page.js'
import { startDirectBridge } from '../lib/bridge.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('Блок 1: AuthManager — проверка учетных данных и защита от тайминг-атак', () => {
  const auth = new AuthManager()

  assert.equal(auth.verifyCredentials('admin', 'secret123', 'admin', 'secret123'), true, 'верный логин и пароль')
  assert.equal(auth.verifyCredentials('admin', 'wrong', 'admin', 'secret123'), false, 'неверный пароль')
  assert.equal(auth.verifyCredentials('guest', 'secret123', 'admin', 'secret123'), false, 'неверный логин')
  assert.equal(auth.verifyCredentials('admin', 'sec', 'admin', 'secret123'), false, 'пароль разной длины')
  assert.equal(auth.verifyCredentials('admin', '', 'admin', 'secret123'), false, 'пустой пароль')
  assert.equal(auth.verifyCredentials('admin', 'secret123', 'admin', ''), false, 'пустой ожидаемый пароль')
  assert.equal(auth.verifyCredentials(null, null, 'admin', 'secret123'), false, 'null учетные данные')
})

test('Блок 2: AuthManager — защита от подбора паролей (Rate Limiting)', () => {
  const auth = new AuthManager()
  const ip = '10.0.0.42'

  assert.equal(auth.checkRateLimit(ip).allowed, true, 'первая попытка разрешена')

  auth.recordAttempt(ip, false)
  auth.recordAttempt(ip, false)
  auth.recordAttempt(ip, false)
  auth.recordAttempt(ip, false)
  assert.equal(auth.checkRateLimit(ip).allowed, true, '4 неудачных попытки еще разрешены')

  auth.recordAttempt(ip, false) // 5-я неудача
  const limit = auth.checkRateLimit(ip)
  assert.equal(limit.allowed, false, 'после 5 неудач доступ временно заблокирован')
  assert.ok(limit.remainingMs > 20000, 'остаток блокировки больше 20 секунд')

  auth.recordAttempt(ip, true) // Успешный вход сбрасывает счетчик
  assert.equal(auth.checkRateLimit(ip).allowed, true, 'после успешного входа счетчик сброшен')
})

test('Блок 3: AuthManager — управление сессиями, временем жизни и отзывом', () => {
  const auth = new AuthManager({ sessionDurationMs: 1000 }) // 1 секунда для теста
  const mockReq = { socket: { remoteAddress: '192.168.1.50' }, headers: { 'user-agent': 'TestAgent/1.0' } }

  const session = auth.createSession('superadmin', mockReq, true)
  assert.ok(session.token, 'токен сгенерирован')
  assert.equal(session.user, 'superadmin')
  assert.equal(session.ip, '192.168.1.50')

  const validated = auth.validateSession(session.token)
  assert.ok(validated, 'активная сессия валидна')
  assert.equal(validated.user, 'superadmin')

  assert.equal(auth.validateSession('non-existent-token'), null, 'несуществующий токен возвращает null')

  // Отзыв сессии
  assert.equal(auth.revokeSession(session.token), true, 'сессия успешно отозвана')
  assert.equal(auth.validateSession(session.token), null, 'отозванная сессия более не валидна')

  // Проверка истечения времени жизни
  const shortSession = auth.createSession('tempuser', mockReq, false)
  shortSession.expiresAt = Date.now() - 100 // искусственно состарим
  assert.equal(auth.validateSession(shortSession.token), null, 'истекшая сессия возвращает null и удаляется')
})

test('Блок 4: Cookie хелперы — makeSessionCookie, clearSessionCookie, extractToken', () => {
  const auth = new AuthManager()
  const token = 'abc123def456'
  const expires = Date.now() + 86400000

  const httpCookie = makeSessionCookie(token, expires, false)
  assert.ok(httpCookie.includes('dsh_auth_session=' + token))
  assert.ok(httpCookie.includes('HttpOnly'))
  assert.ok(httpCookie.includes('Path=/'))
  assert.ok(httpCookie.includes('SameSite=Lax'))
  assert.ok(!httpCookie.includes('Secure'), 'на HTTP нет Secure')

  const httpsCookie = makeSessionCookie(token, expires, true)
  assert.ok(httpsCookie.includes('Secure'), 'на HTTPS есть Secure')

  const cleared = clearSessionCookie()
  assert.ok(cleared.includes('dsh_auth_session=;'))
  assert.ok(cleared.includes('Max-Age=0'))

  const reqWithCookie = { headers: { cookie: 'foo=bar; dsh_auth_session=' + token + '; other=1' } }
  assert.equal(auth.extractToken(reqWithCookie), token, 'токен извлечен из cookie')

  const reqWithHeader = { headers: { 'x-dsh-auth-token': token } }
  assert.equal(auth.extractToken(reqWithHeader), token, 'токен извлечен из x-dsh-auth-token')
})

test('Блок 5: renderLoginPage — генерация фирменной страницы входа', () => {
  const html = renderLoginPage({
    https: true,
    defaultUser: 'admin',
    version: '0.7.10',
  })

  assert.ok(html.toLowerCase().includes('<!doctype html>'), 'валидный HTML5 doctype')
  assert.ok(html.includes('DeepSeek Harness'), 'заголовок страницы')
  assert.ok(html.includes('Вход в систему управления агентами'), 'подзаголовок страницы')
  assert.ok(html.includes('name="username"'), 'поле username')
  assert.ok(html.includes('name="password"'), 'поле password')
  assert.ok(html.includes('action="/dsh-lanmode/auth/login"'), 'form action')
  assert.ok(html.includes('11111b'), 'тема Catppuccin Mocha')
  assert.ok(html.includes('6366f1'), 'индиго акцент')
  assert.ok(html.includes('HTTPS'), 'индикатор HTTPS')
  assert.ok(html.includes('/dsh-lanmode/auth/login'), 'отправка на эндпоинт login')
  assert.ok(html.includes('window.location.href = returnTo'), 'редирект после успешной авторизации')
})

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

test('Блок 6: bridge.js — блокировка неавторизованных запросов при passwordAuth: true', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, source: 'upstream' }))
  })
  const upstreamPort = await listen(upstream)

  const bridge = http.createServer()
  const bridgePort = await listen(bridge)
  bridge.close()

  const authManager = new AuthManager()
  let passwordAuthEnabled = true

  const stop = startDirectBridge(
    { webServer: { port: upstreamPort } },
    {
      hosts: ['127.0.0.1'],
      port: bridgePort,
      authManager,
      get passwordAuth() { return passwordAuthEnabled },
      authUser: 'admin',
      version: '0.7.10',
      log: () => {},
    },
  )

  await new Promise((resolve) => setTimeout(resolve, 100))

  try {
    // 1. GET / с заголовком Accept: text/html -> возвращает страницу логина 200 OK
    const htmlRes = await fetch(`http://127.0.0.1:${bridgePort}/`, {
      headers: { 'Accept': 'text/html' },
    })
    assert.equal(htmlRes.status, 200)
    const htmlText = await htmlRes.text()
    assert.ok(htmlText.includes('DeepSeek Harness') && htmlText.includes('Вход'), 'возвращена страница входа')

    // 2. API запрос без куки -> возвращает 401 и заголовок x-dsh-auth-required
    const apiRes = await fetch(`http://127.0.0.1:${bridgePort}/api/test`, {
      headers: { 'Accept': 'application/json' },
    })
    assert.equal(apiRes.status, 401)
    assert.equal(apiRes.headers.get('x-dsh-auth-required'), '1')

    // 3. Публичный маршрут /dsh-lanmode/auth/* -> пропускается к upstream
    const publicRes = await fetch(`http://127.0.0.1:${bridgePort}/dsh-lanmode/auth/login`)
    assert.equal(publicRes.status, 200, 'публичный auth маршрут проходит без сессии')

    // 4. Создаем сессию и отправляем запрос с валидной кукой
    const session = authManager.createSession('admin', { socket: { remoteAddress: '127.0.0.1' } })
    const authRes = await fetch(`http://127.0.0.1:${bridgePort}/api/test`, {
      headers: {
        'Accept': 'application/json',
        'Cookie': `dsh_auth_session=${session.token}`,
      },
    })
    assert.equal(authRes.status, 200, 'запрос с валидной сессией доходит до upstream')
    const authData = await authRes.json()
    assert.equal(authData.source, 'upstream')

    // 5. Динамическое отключение passwordAuth
    passwordAuthEnabled = false
    const noAuthRes = await fetch(`http://127.0.0.1:${bridgePort}/api/test`, {
      headers: { 'Accept': 'application/json' },
    })
    assert.equal(noAuthRes.status, 200, 'при выключенном passwordAuth запросы проходят без куки')
  } finally {
    stop()
    upstream.close()
  }
})

test('Блок 7: Проверка кода клиентских файлов shim.js и client.js', () => {
  const shim = readFileSync(path.join(here, '..', 'lib', 'shim.js'), 'utf8')
  assert.ok(shim.includes('x-dsh-auth-required'), 'shim.js перехватывает x-dsh-auth-required')
  assert.ok(shim.includes("window.location.href = '/'"), 'shim.js перенаправляет на / при 401')

  const client = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')
  assert.ok(client.includes('passwordAuth'), 'client.js содержит passwordAuth')
  assert.ok(client.includes('authUser'), 'client.js содержит authUser')
  assert.ok(client.includes('authPassword'), 'client.js содержит authPassword')
  assert.ok(client.includes('authPasswordRef'), 'client.js содержит authPasswordRef')
  assert.ok(client.includes('/dsh-lanmode/auth/logout'), 'client.js содержит маршрут logout')
  assert.ok(client.includes('Выйти из системы'), 'client.js содержит кнопку Выйти из системы')
})
