// dsh-lanmode client entry.
// The host loads this one classic script through exports["./client"].
// The loader cannot require() a sibling file, so the factory body lives in
// lib/client-parts and is injected into index.html before this module runs.

window.__ModuleLoader__.load({
  id: '@goodandready/dsh-lanmode',
  factory: function (require) {
    var parts = window.__DSH_LANMODE_PARTS
    if (!parts || typeof parts.installPrelude !== 'function') {
      throw new Error('dsh-lanmode client parts were not injected')
    }
    var env = { require: require }
    parts.installPrelude(env)
    parts.installI18n(env)
    parts.installStyles(env)
    parts.installCard(env)
    parts.installQr(env)
    parts.installApply(env)
    return env.module.exports
  },
})
