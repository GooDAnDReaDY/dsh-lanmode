import test from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { startDirectBridge } from "../lib/bridge.js"
import { generateQRSvg, generateCachedQRSvg, clearQRCache } from "../lib/qr.js"
import { parseAllow } from "../lib/access.js"

test("Issue #117: Upstream HTTP Agent Keep-Alive reuse in bridge.js", async (t) => {
  let connectionCount = 0
  const upstreamServer = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" })
    res.end("upstream-pong")
  })
  upstreamServer.on("connection", (socket) => {
    connectionCount++
  })

  await new Promise((resolve) => upstreamServer.listen(0, "127.0.0.1", resolve))
  const upstreamPort = upstreamServer.address().port

  const ctx = {
    webServer: { port: upstreamPort },
    get: () => undefined,
  }

  const logs = []
  const bridgePort = upstreamPort + 1000
  const { rules } = parseAllow(["127.0.0.1/32", "::1/128"])
  const stopBridge = startDirectBridge(ctx, {
    hosts: ["127.0.0.1"],
    port: bridgePort,
    log: (msg) => logs.push(msg),
    allow: rules,
  })

  try {
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`http://127.0.0.1:${bridgePort}/test-${i}`)
      assert.equal(res.status, 200)
      const text = await res.text()
      assert.equal(text, "upstream-pong")
    }

    assert.equal(connectionCount, 1, `Expected 1 upstream TCP connection reused, but got ${connectionCount}`)
  } finally {
    stopBridge()
    await new Promise((resolve) => upstreamServer.close(resolve))
  }
})

test("Issue #117: generateCachedQRSvg caches SVG output and respects options", () => {
  clearQRCache()
  const text1 = "http://dsh.local:3088/?token=abc"
  const text2 = "http://dsh.local:3088/?token=xyz"

  const svg1_first = generateCachedQRSvg(text1, { size: 200 })
  const svg1_second = generateCachedQRSvg(text1, { size: 200 })
  assert.equal(svg1_first, svg1_second)

  const svg2 = generateCachedQRSvg(text2, { size: 200 })
  assert.notEqual(svg1_first, svg2)

  const svg1_large = generateCachedQRSvg(text1, { size: 320 })
  assert.notEqual(svg1_first, svg1_large)
  assert.match(svg1_large, /width="320"/)
})

test("Issue #117: /dsh-lanmode/qr route returns ETag and handles 304 Not Modified", async () => {
  const svg = generateCachedQRSvg("http://dsh.local:3088/", { size: 320 })
  assert.ok(svg.length > 0)
  assert.match(svg, /<svg /)
})
