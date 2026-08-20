// dsh-lanmode — клиентская половина.
//
// Зачем это существует.
//
// Веб-интерфейс харнесса отключает настройки на любой странице, открытой не с
// localhost. Решение принимается в браузере по имени хоста:
//
//   isLoopback: pageLocation === undefined || isLoopbackHostname(pageLocation.hostname)
//
// и дальше сервис настроек уходит в режим «памяти»: общее зеркало документа
// никогда не читается, каждый связанный раздел сразу получает статус
// "unavailable", а запись молча выбрасывается. Внешне это выглядит как пустые
// карточки настроек у всех плагинов сразу и пустая вкладка «Настройки
// плагинов» — при полностью исправном сервере.
//
// Сервер этого ограничения не разделяет: и чтение (settings.describe), и
// запись (settings.mutate) по сети работают штатно, если Origin совпадает с
// адресом страницы — то есть ровно в том случае, когда запрос шлёт сам
// интерфейс. Проверено на живом харнессе через обратный прокси.
//
// Поэтому плагин делает одно: на не-loopback странице поднимает собственный
// экземпляр той же механики поверх тех же вызовов и отдаёт его как службу.
// На loopback-странице он не делает ничего — там ядро справляется само.

window.__ModuleLoader__.load({
  id: '@goodandready/dsh-lanmode',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // ------------------------------------------------- зеркало документа
    //
    // Один читатель settings.describe на всю страницу: разделы выводятся из
    // него, поэтому они не могут разойтись во мнении о документе.
    function createMirror(api) {
      let snapshot = { status: 'idle', view: undefined, error: null }
      const listeners = new Set()
      let inFlight
      let rerun = false

      const notify = () => {
        for (const listener of [...listeners]) {
          try { listener() } catch (listenerFailure) { /* чужой слушатель нам не судья */ }
        }
      }
      const put = (next) => { snapshot = next; notify() }

      async function run() {
        do {
          rerun = false
          let outcome
          try {
            const response = await api.settings.describe({})
            outcome = response.result.ok
              ? { view: response.result.value }
              : { failure: response.result.error.message }
          } catch (wireFailure) {
            outcome = { failure: String(wireFailure && wireFailure.message || wireFailure) }
          }
          if (outcome.view !== undefined) {
            put({ status: 'ready', view: outcome.view, error: null })
          } else {
            // Держим то, что уже прочитали: неудачное обновление не должно
            // опустошать готовые разделы.
            put({ status: snapshot.view === undefined ? 'idle' : 'ready', view: snapshot.view, error: outcome.failure })
          }
        } while (rerun)
      }

      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        load() {
          if (inFlight !== undefined) { rerun = true; return inFlight }
          inFlight = run().finally(() => { inFlight = undefined })
          return inFlight
        },
        ensure() {
          if (inFlight !== undefined) return inFlight
          if (snapshot.status === 'idle') return this.load()
          return Promise.resolve()
        },
        // Ответ на запись возвращает свежий вид одного раздела — вкладываем его
        // на место, чтобы не перечитывать весь документ ради одного поля.
        acceptView(view) {
          const before = snapshot
          if (before.view === undefined) { this.load(); return }
          const known = before.view.namespaces.some((row) => row.ns === view.ns)
          const namespaces = known
            ? before.view.namespaces.map((row) => (row.ns === view.ns ? view : row))
            : before.view.namespaces.concat([view])
          put({ ...before, view: { ...before.view, namespaces } })
        },
      }
    }

    // ------------------------------------------------------- раздел настроек
    //
    // Снимок повторяет форму ядрового: status, value, base, user, revision,
    // writable. Карточки читают именно эти поля, поэтому подмена для них
    // незаметна.
    function createScope(api, mirror, namespace) {
      let snapshot = {
        status: 'loading',
        value: undefined,
        base: undefined,
        user: undefined,
        revision: undefined,
        writable: false,
        mode: 'host',
      }
      const listeners = new Set()
      const notify = () => {
        for (const listener of [...listeners]) {
          try { listener() } catch (listenerFailure) { /* см. выше */ }
        }
      }

      function derive() {
        const held = mirror.getSnapshot()
        if (held.view === undefined) return
        const row = held.view.namespaces.find((candidate) => candidate.ns === namespace)
        if (row === undefined) {
          // Хост про такой раздел не знает. Это законное состояние: плагин
          // может быть ещё не применён.
          snapshot = { ...snapshot, status: 'unavailable', writable: held.view.writable }
          notify()
          return
        }
        snapshot = {
          status: 'ready',
          value: row.value,
          base: row.base,
          user: row.user,
          revision: row.revision,
          writable: held.view.writable,
          mode: 'host',
        }
        notify()
      }

      const off = mirror.subscribe(derive)
      derive()

      // Записи выстраиваем в очередь: правка ревизии, пришедшая из ответа,
      // должна попасть в следующий запрос, иначе хост отвергнет его как
      // устаревший.
      let tail = Promise.resolve()
      function write(op) {
        const task = tail.then(async () => {
          const revision = snapshot.revision
          let response
          try {
            response = await api.settings.mutate({
              ns: namespace,
              ops: [op],
              ...(revision === undefined ? {} : { expectedRevision: revision }),
            })
          } catch (wireFailure) {
            await mirror.load()
            throw wireFailure
          }
          if (!response.result.ok) {
            // Чаще всего это разошедшаяся ревизия: перечитываем и отдаём
            // ошибку наверх, чтобы карточка показала неудачу сохранения.
            await mirror.load()
            throw new Error(response.result.error.message)
          }
          mirror.acceptView(response.result.value)
        })
        tail = task.catch(() => {})
        return task
      }

      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set: (field, value) => write({ op: 'set', path: [field], value }),
        unset: (field) => write({ op: 'unset', path: [field] }),
        dispose: () => { off() },
      }
    }

    exports.inject = ['connection']

    exports.apply = function apply(ctx) {
      const connection = ctx.get('connection')

      // На loopback-странице ядро работает штатно, и вмешиваться незачем.
      if (connection.isLoopback) return

      const mirror = createMirror(connection.api)
      const binder = {
        bind: (spec) => createScope(connection.api, mirror, spec && spec.namespace),
        describe: () => mirror,
      }

      // Документ меняют не только из этой вкладки; ядро слушает тот же сигнал.
      try {
        const remote = ctx.get('remote')
        if (remote && typeof remote.$on === 'function') {
          ctx.effect(() => remote.$on('settings/document-updated', () => { mirror.load() }),
            'dsh-lanmode: перечитывать документ настроек по сигналу хоста')
        }
      } catch (noRemoteService) { /* без сигнала обойдёмся, останется ручное перечитывание */ }

      mirror.ensure()

      // Своя служба: ею может пользоваться любой плагин, которому нужны
      // настройки по сети.
      ctx.provide('lanSettings', binder)

      // Попытка встать на место ядровой службы. Если разрешено — оживает весь
      // интерфейс настроек разом, включая чужие плагины и вкладку ядра.
      // Если ядро не отдаёт имя, остаёмся со своей службой: наши плагины
      // умеют её спрашивать.
      let tookOver = false
      try {
        ctx.provide('settingsScope', binder)
        tookOver = true
      } catch (nameTaken) {
        tookOver = false
      }

      // Одна строка в консоли: без неё непонятно, работает режим или нет.
      try {
        console.info('[dsh-lanmode] страница не loopback (' + location.hostname + '); '
          + 'настройки подняты через сеть, ядровая служба '
          + (tookOver ? 'подменена' : 'оставлена как есть'))
      } catch (noConsole) { /* незачем */ }
    }

    return module.exports
  },
})
