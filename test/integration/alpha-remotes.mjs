// Run against an existing built DSH checkout; no host RPC or user data access.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

const coreRoot = process.argv[2]
const shimPath = process.argv[3] || new URL('../../lib/shim.js', import.meta.url)
assert.ok(coreRoot, 'usage: node test/integration/alpha-remotes.mjs <built-dsh-root> [shim-file]')
const cordis = await import(pathToFileURL(path.join(coreRoot, 'vendor/cordis/lib/index.js')))
const definitions = new Map()
const modules = new Map([['@deepseek-ai/cordis', cordis]])
const window = {
  __DSH_LANMODE__: { settings: true },
  __ModuleLoader__: { load: entry => definitions.set(entry.id, entry) },
}
const sandbox = vm.createContext({
  window, location: { search: '', hostname: 'example.test' },
  URLSearchParams, console, AbortController, crypto: globalThis.crypto,
  setTimeout, clearTimeout, URL,
})
vm.runInContext(readFileSync(shimPath, 'utf8'), sandbox)
for (const bundle of ['typert/registry', 'api/gateway', 'api/remotes']) {
  vm.runInContext(readFileSync(path.join(coreRoot, 'packages', bundle, 'lib/client.js'), 'utf8'), sandbox)
}
function requireModule(id) {
  if (!modules.has(id)) {
    assert.ok(definitions.has(id), `missing browser module: ${id}`)
    modules.set(id, definitions.get(id).factory(requireModule))
  }
  return modules.get(id)
}

const ctx = new cordis.Context()
try {
  const registry = requireModule('@deepseek-ai/dsh-typert-registry')
  await ctx.plugin(registry.default ?? registry)
  ctx.provide('connection', {
    rpc: { call: async () => {}, open: async function* () {} },
    registerGenerationSource: () => () => {}, start: () => ({ stop() {} }),
  })
  await ctx.plugin(requireModule('@deepseek-ai/dsh-api-gateway'))
  const remotes = requireModule('@deepseek-ai/dsh-api-remotes')
  assert.equal(remotes.apply.prototype, undefined, 'async apply must not become a constructor')
  await ctx.plugin(remotes)
  for (const id of ['remote.session', 'remote.workspace', 'remote.subagents', 'remote.pluginInventory']) {
    assert.ok(ctx.get(id), `${id} must exist when boot await finishes, without a delay`)
  }
  process.stdout.write('PASS: actual DSH remotes are ready at the awaited boot boundary\n')
} finally {
  await ctx.fiber.dispose()
}
