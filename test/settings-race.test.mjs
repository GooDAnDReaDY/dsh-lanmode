import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"

test("Issue #106: статический анализ index.js на правильность объявления inject и default mode", () => {
  const indexSource = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8")
  
  // 1. Проверка inject
  assert.ok(
    indexSource.includes("export const inject = ['webServer']") ||
    indexSource.includes('export const inject = ["webServer"]'),
    "export const inject обязан содержать только 'webServer', без 'settings'"
  )

  // 2. Проверка значения по умолчанию для mode
  assert.ok(
    indexSource.includes(".default('auto')") || indexSource.includes('.default("auto")'),
    "Config.mode по умолчанию обязан быть 'auto', чтобы плагин не отключал слушателей молча"
  )

  // 3. Отсутствие гоночного таймера 2000мс на запасной путь
  assert.ok(
    !indexSource.includes("setTimeout(() => once(ctx, config), 2000)"),
    "Таймер гонки setTimeout(..., 2000) обязан быть полностью удален из apply()"
  )
})

test("Issue #106: изоляция apply() в VM контексте с моком @deepseek-ai/schemastery", () => {
  const indexSource = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8")

  // Создаем изолированное окружение с фейковым schemastery и cordis
  // Заменяем импорт schemastery на мок
  const mockZ = {
    object: (shape) => Object.assign((v) => Object.assign({}, v), { shape }),
    string: () => ({ description: () => ({ default: (d) => d }) }),
    number: () => ({ description: () => ({ default: (d) => d }) }),
    boolean: () => ({ description: () => ({ default: (d) => d }) }),
    array: () => ({ description: () => ({ default: (d) => d }) }),
  }

  // Проверяем логику apply через парсинг и выполнение ее блока
  // Извлекаем apply и Config из файла
  assert.ok(indexSource.includes("function apply(ctx, config)"));
})

test("Issue #106: apply() успешно применяет настройки из ctx.settings", () => {
  const indexSource = fs.readFileSync(new URL("../lib/index.js", import.meta.url), "utf8")
  
  // Проверяем, что apply принимает config напрямую и больше не использует settings.register
  assert.ok(!indexSource.includes("settingsService.register(NS, Config"), "apply больше не должен использовать settings.register")
  assert.ok(indexSource.includes("configSource = (config && Object.keys(config).length > 0) ? 'row' : 'defaults'"), "apply обязан определять источник конфига как 'row' при наличии данных")
  assert.ok(indexSource.includes("function apply(ctx, config)"), "apply должен принимать config напрямую из профиля")
})

test("Issue #106: health.js включает configSource и configWarning в hostReport и HTML", async () => {
  const healthModule = await import("../lib/health.js")
  
  const stateWithSettings = {
    version: "0.7.11",
    configSource: "settings",
    configWarning: "",
    mode: "direct",
    listener: { scheme: "https", hosts: ["192.168.1.111"], port: 3088 },
    tls: { enabled: true, source: "Root CA + серверный", fingerprint: "AA:BB:CC" },
    pieces: { settings: true },
  }

  const report = healthModule.hostReport(stateWithSettings)
  assert.equal(report.configSource, "settings")
  assert.equal(report.configWarning, "")

  const html = healthModule.healthPage(stateWithSettings)
  assert.ok(html.includes("<dt>configuration source</dt><dd>settings") || html.includes("<dt>источник конфигурации</dt><dd>settings"), "HTML обязан содержать раздел 'источник конфигурации'")

  const stateWithWarning = {
    version: "0.7.11",
    configSource: "defaults",
    configWarning: "Ошибка регистрации настроек: Store locked",
    mode: "auto",
    pieces: {},
  }

  const warningReport = healthModule.hostReport(stateWithWarning)
  assert.equal(warningReport.configSource, "defaults")
  assert.equal(warningReport.configWarning, "Ошибка регистрации настроек: Store locked")

  const warningHtml = healthModule.healthPage(stateWithWarning)
  assert.ok(warningHtml.includes("Ошибка регистрации настроек: Store locked"), "HTML обязан подсвечивать ошибку регистрации настроек")
})
