;(function (parts) {
  parts.installApply = function (env) {
    var module = env.module, resolveSnapshot = env.resolveSnapshot, LanModeCard = env.LanModeCard, NS = env.NS
    var I18N = env.I18N, ROW_ID = env.ROW_ID, ROW_CONFIG_KEY = env.ROW_CONFIG_KEY, QuickQrPopover = env.QuickQrPopover
    var translate = env.translate
    module.exports.resolveSnapshot = resolveSnapshot
    module.exports.LanModeCard = LanModeCard
    module.exports.inject = ['slots', 'locale']
    module.exports.apply = function apply(ctx) {
      // #175: mobile nav can close the details pane.
      try { if (ctx.layout) window.__DSH_LANMODE_LAYOUT = ctx.layout } catch (err) { /* bestEffort */ void err }

      // #233: core hides path/file actions unless connection.isLoopback is true.
      try {
        if (ctx.connection) ctx.connection.isLoopback = true
      } catch (err) { /* bestEffort */ void err }

      // #235: remote memory store forgets the welcome acknowledgement.
      try {
        var helpers = window.__DSH_LANMODE_PARTS || {}
        var describe = ctx.settings && ctx.settings.describe
        if (typeof describe === 'function' && typeof helpers.welcomeVersion === 'function') {
          Promise.resolve(describe.call(ctx.settings)).then(function (doc) {
            var version = helpers.welcomeVersion(doc)
            if (version != null && ctx.slots && typeof ctx.slots.register === 'function') {
              ctx.slots.register({
                name: 'settings.onboarding',
                id: 'dsh-lanmode-welcome',
                acknowledged: true,
                welcomeNoticeVersion: version,
              })
            }
            // #234: memory mode can omit view; mirror schema/document when present.
            var view = helpers.settingsView && helpers.settingsView(doc)
            if (view && ctx.configForms && typeof ctx.configForms.describe === 'function') {
              try { ctx.configForms.describe(view) } catch (err) { /* bestEffort */ void err }
            }
          }).catch(function () {})
        }
      } catch (err) { /* bestEffort */ void err }

      if (ctx.locale && ctx.locale.register) {
        try {
          ctx.locale.register(NS, {
            en: {
              title: I18N.en.title,
              sub: I18N.en.sub,
            },
            zh: {
              title: I18N.zh.title,
              sub: I18N.zh.sub,
            },
          })
        } catch (err) { /* bestEffort */ void err }
      }

      function registerSlotWhenReady(slotName, registerFn) {
        if (!ctx.slots) return
        if (typeof ctx.slots.inject === 'function') {
          try {
            ctx.slots.inject(slotName, function () {
              try {
                return registerFn()
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('[dsh-lanmode] Error registering slot ' + slotName + ':', err)
              }
            })
            return
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[dsh-lanmode] Failed to subscribe to slot ' + slotName + ' via slots.inject:', err)
          }
        }
        if (typeof ctx.slots.register === 'function') {
          try {
            registerFn()
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[dsh-lanmode] Failed to register slot ' + slotName + ':', err)
          }
        }
      }

      // List seat (plugins.item): the seat the Plugins page renders as the plugin's own
      // page with its configuration. The label is a static string on purpose — it is
      // resolved while the page renders, and a locale lookup there would take the whole
      // client batch down with it.
      registerSlotWhenReady('plugins.item', function () {
        return ctx.slots.register(
          {
            name: 'plugins.item',
            id: ROW_ID,
            order: 40,
            label: function () { return 'LAN Access & Mobile Gateway' },
            locale: NS,
            inject: function () { return { ctx: ctx } },
          },
          LanModeCard,
        )
      })

      // Row seat and the legacy seat stay as fallbacks.
      registerSlotWhenReady('plugins.row.config', function () {
        return ctx.slots.register(
          {
            name: 'plugins.row.config',
            key: ROW_CONFIG_KEY,
            locale: NS,
            order: 40,
            inject: function () { return { ctx: ctx } },
          },
          LanModeCard,
        )
      })

      registerSlotWhenReady('settings.plugin.item', function () {
        return ctx.slots.register(
          {
            name: 'settings.plugin.item',
            key: NS,
            locale: NS,
            order: 40,
            inject: function () { return { ctx: ctx } },
          },
          LanModeCard,
        )
      })

      registerSlotWhenReady('sidebar.footer.action', function () {
        return ctx.slots.register(
          {
            name: 'sidebar.footer.action',
            id: '@goodandready/dsh-lanmode:qr',
            key: NS + '-footer',
            order: 95,
          },
          QuickQrPopover,
        )
      })

      var pendingNotificationsCount = 0

      function clearAppBadge() {
        pendingNotificationsCount = 0
        try {
          if (typeof navigator !== 'undefined' && typeof navigator.clearAppBadge === 'function') {
            navigator.clearAppBadge().catch(function () {})
          }
        } catch (err) { /* bestEffort */ void err }
      }

      function notifyTurnEnd(body) {
        pendingNotificationsCount++
        try {
          if (typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function') {
            navigator.setAppBadge(pendingNotificationsCount).catch(function () {})
          }
        } catch (err) { /* bestEffort */ void err }

        if (typeof document === 'undefined' || !document.hidden) return
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

        try {
          var notification = new Notification('DeepSeek Harness', {
            body: body || translate('turnEndNotification'),
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'dsh-lanmode-turn',
          })
          notification.onclick = function () {
            if (typeof window !== 'undefined') window.focus()
            clearAppBadge()
            notification.close()
          }
        } catch (err) { /* bestEffort */ void err }
      }

      function setupClientListeners() {
        var disposers = []
        var helpers = window.__DSH_LANMODE_PARTS || {}
        if (helpers.installReauthOverlay) helpers.installReauthOverlay({ translate: translate })
        if (helpers.installBinaryDownload) helpers.installBinaryDownload(document)
        if (helpers.installRemoteFileOpen) helpers.installRemoteFileOpen(window)


        if (ctx.on) {
          var offTurn = ctx.on('turn/end', function () {
            notifyTurnEnd(translate('turnEndNotification'))
            try { if (navigator && navigator.vibrate) navigator.vibrate([30, 50, 30]) } catch (err) { /* bestEffort */ void err }
          })
          if (typeof offTurn === 'function') disposers.push(offTurn)

          var offApproval = ctx.on('approval/asked', function (event) {
            var tool = (event && event.toolName) ? (translate('toolPrefix') + event.toolName) : translate('approvalNotification')
            notifyTurnEnd(tool)
            try { if (navigator && navigator.vibrate) navigator.vibrate([50, 100, 50, 100]) } catch (err) { /* bestEffort */ void err }
          })
          if (typeof offApproval === 'function') disposers.push(offApproval)
        }

        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          var onVisible = function () {
            if (document.visibilityState === 'visible') {
              clearAppBadge()
              try {
                if (ctx.connection && ctx.connection.refresh) ctx.connection.refresh()
              } catch (err) { /* bestEffort */ void err }
              window.dispatchEvent(new CustomEvent('dsh-lanmode-reconnect'))
            }
          }
          document.addEventListener('visibilitychange', onVisible)
          window.addEventListener('focus', onVisible)
          // #212: Wi-Fi <-> LTE restores should refresh the core session.
          window.addEventListener('online', onVisible)
          // #246: persist locale.preference when the host locale bus fires.
          if (ctx.locale && typeof ctx.locale.subscribe === 'function') {
            try {
              var offLocale = ctx.locale.subscribe(function (event) {
                var helpers = window.__DSH_LANMODE_PARTS || {}
                var pref = helpers.localePreference && helpers.localePreference(event)
                var mutate = ctx.settings && ctx.settings.mutate
                if (!pref || typeof mutate !== 'function') return
                try { mutate.call(ctx.settings, { 'locale.preference': pref }) } catch (err) { /* bestEffort */ void err }
              })
              if (typeof offLocale === 'function') disposers.push(offLocale)
            } catch (err) { /* bestEffort */ void err }
          }
          disposers.push(function () {
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('focus', onVisible)
            window.removeEventListener('online', onVisible)
          })
        }

        return function () {
          for (var i = 0; i < disposers.length; i++) {
            try { disposers[i]() } catch (err) { /* bestEffort */ void err }
          }
        }
      }

      var cleanupListeners = null
      if (typeof ctx.effect === 'function') {
        ctx.effect(function () {
          return setupClientListeners()
        }, 'dsh-lanmode-client-listeners')
      } else {
        cleanupListeners = setupClientListeners()
      }
      return cleanupListeners
    }

  }
})(window.__DSH_LANMODE_PARTS = window.__DSH_LANMODE_PARTS || {});
