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
})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {})
