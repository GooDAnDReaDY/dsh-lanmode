import test from "node:test"
import assert from "node:assert/strict"
import { AuthManager } from "../lib/auth.js"
import http from "node:http"
import { startDirectBridge } from "../lib/bridge.js"

test("Issue #119: AuthManager session capacity limit and cleanupExpired", (t) => {
  const auth = new AuthManager({ maxSessions: 5, sessionDurationMs: 100 })

  // 1. Создаем 6 сессий (превышение maxSessions)
  for (let i = 0; i < 6; i++) {
    auth.createSession("user" + i, { socket: { remoteAddress: "127.0.0.1" }, headers: {} })
  }
  // Должно быть вытеснено до 5
  assert.equal(auth.sessions.size, 5)

  // 2. Проверяем авто-очистку истекших сессий
  return new Promise((resolve) => {
    setTimeout(() => {
      auth.cleanupExpired()
      assert.equal(auth.sessions.size, 0)
      auth.destroy()
      resolve()
    }, 120)
  })
})

test("Issue #119: AuthManager failedAttempts IP pruning", () => {
  const auth = new AuthManager()
  auth.recordAttempt("192.168.1.50", false)
  assert.equal(auth.failedAttempts.size, 1)

  // Имитируем старую запись
  const rec = auth.failedAttempts.get("192.168.1.50")
  rec.lastAttemptAt = Date.now() - 4000000 // > 1 часа назад

  auth.cleanupExpired()
  assert.equal(auth.failedAttempts.size, 0)
  auth.destroy()
})

test("Issue #119: bridge.js skips compression when content-length < 1024", async () => {
  // Проверяем, что для мелких ответов сжатие не применяется
  const upstreamServer = http.createServer((req, res) => {
    const tinyBody = JSON.stringify({ ok: true })
    res.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(tinyBody),
    })
    res.end(tinyBody)
  })

  await new Promise((resolve) => upstreamServer.listen(0, "127.0.0.1", resolve))
  const upstreamPort = upstreamServer.address().port

  const ctx = {
    webServer: { port: upstreamPort },
    get: () => undefined,
  }

  const bridgePort = upstreamPort + 1000
  const stopBridge = startDirectBridge(ctx, {
    hosts: ["127.0.0.1"],
    port: bridgePort,
    log: () => {},
    allow: [],
  })

  try {
    const res = await fetch(`http://127.0.0.1:${bridgePort}/tiny`, {
      headers: { "accept-encoding": "gzip, br" }
    })
    assert.equal(res.status, 200)
    // Для ответа < 1024 байт content-encoding не должен выставляться мостом
    assert.equal(res.headers.get("content-encoding"), null)
    const json = await res.json()
    assert.equal(json.ok, true)
  } finally {
    await stopBridge()
    await new Promise((resolve) => upstreamServer.close(resolve))
  }
})
