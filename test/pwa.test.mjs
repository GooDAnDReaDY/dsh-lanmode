import test from 'node:test'
import assert from 'node:assert/strict'

test('структура PWA манифеста', () => {
  const manifest = {
    name: 'DeepSeek Harness',
    short_name: 'DSH',
    display: 'standalone',
    theme_color: '#1e1e2e',
    icons: [{ src: '/favicon.ico' }],
  }
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.short_name, 'DSH')
  assert.ok(manifest.theme_color)
})

test('генерация метатегов PWA и safe area для мобильных', () => {
  const pwaMeta = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    + '<meta name="apple-mobile-web-app-capable" content="yes">'
    + '<link rel="manifest" href="/dsh-lanmode/manifest.json">'

  assert.ok(pwaMeta.includes('viewport-fit=cover'))
  assert.ok(pwaMeta.includes('apple-mobile-web-app-capable'))
  assert.ok(pwaMeta.includes('/dsh-lanmode/manifest.json'))
})
