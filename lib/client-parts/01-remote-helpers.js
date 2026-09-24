// Remote-session helpers shared with the injected client.
// Zero hardcoded Cyrillic characters.

;(function (parts) {
  parts.welcomeVersion = function welcomeVersion(doc) {
    if (!doc || typeof doc !== 'object') return null
    var bag = doc.value && typeof doc.value === 'object' ? doc.value : doc
    var block = bag['ui-onboarding'] || bag.uiOnboarding
    if (!block || typeof block !== 'object') return null
    var version = block.welcomeNoticeVersion
    if (version == null || version === '') return null
    return version
  }

  parts.settingsView = function settingsView(doc) {
    if (!doc || typeof doc !== 'object') return null
    if (doc.view) return doc.view
    var bag = doc.value && typeof doc.value === 'object' ? doc.value : doc
    if (bag.view) return bag.view
    if (bag.schema || bag.document || bag.config) {
      return { schema: bag.schema, document: bag.document || bag.config, source: 'dsh-lanmode-mirror' }
    }
    return null
  }
  parts.localePreference = function localePreference(event) {
    if (typeof event === 'string') return event.trim() || null
    if (!event || typeof event !== 'object') return null
    var value = event.preference || event.locale || event.value
    if (typeof value !== 'string') return null
    var clean = value.trim()
    return clean || null
  }

  parts.extractOpenPath = function extractOpenPath(payload) {
    if (!payload || typeof payload !== 'object') return ''
    if (typeof payload.path === 'string' && payload.path) return payload.path
    var args = payload.args
    if (!args || typeof args !== 'object') return ''
    if (typeof args.path === 'string' && args.path) return args.path
    var keys = Object.keys(args)
    for (var i = 0; i < keys.length; i++) {
      var value = args[keys[i]]
      if (value && typeof value === 'object' && typeof value.path === 'string' && value.path) return value.path
    }
    return ''
  }

})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {})
