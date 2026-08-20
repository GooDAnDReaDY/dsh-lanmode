# dsh-lanmode

Open the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI from another device — a phone, a tablet, the laptop on the other side of the room — and have **all of it** work, including the parts the UI switches off when the page is not `localhost`.

Works whether you put a reverse proxy in front of the harness or let this plugin serve the network itself. Pick a mode, restart, done.

## What breaks without it

Reach the UI at a LAN address and you get some mix of:

- **Settings → Models**: `settings are unavailable in this browser`
- **Settings → Plugins → Plugin configuration**: empty, no cards at all
- every plugin's settings card: blank, and saving silently does nothing
- on plain HTTP, nothing loads at all: sessions and models never render

None of that is the server refusing. The server serves settings over the network perfectly well.

## Why it happens

Two independent things.

**The settings service turns itself off.** The UI decides from the page's hostname:

```js
isLoopback: pageLocation === undefined || isLoopbackHostname(hostname)
```

`isLoopbackHostname` accepts `localhost`, `[::1]` and `127.0.0.0/8`, nothing else. Anything else puts the settings service into a process-local mode where the shared mirror of the settings document is never read, every namespace reports `status: "unavailable"` for the life of the page, and writes are dropped before they reach the wire.

**Some Web APIs only exist on a secure context.** `crypto.randomUUID` is called on boot-critical paths, and `navigator.clipboard` behind the copy buttons. Over plain HTTP from a LAN address the browser withholds both.

## What the plugin does

Everything happens through the web server's official index tap: one script is injected into `index.html` ahead of the boot manifest. No product source is modified, and removing the plugin restores the page exactly.

| Piece | Setting | What it does |
|---|---|---|
| Settings | `settings` | Hands the two settings packages a connection whose `isLoopback` reads `true`. Everything downstream — the shared mirror, every namespace scope, the core's own pages — then behaves as it does on localhost. |
| `crypto.randomUUID` | `randomUuid` | Provides an RFC 4122 v4 implementation over `crypto.getRandomValues`, which insecure origins do have. A no-op where the real one exists. |
| `navigator.clipboard` | `clipboard` | Provides a `writeText` fallback so the copy buttons keep working. A no-op where the real one exists. |

The settings substitution is deliberately narrow. Three packages read that flag, and the third is deliverables, where it decides whether a produced file may be opened locally — forcing it there would ask the Host to open paths on the server's desktop. Only the settings packages see the substitute.

## Two modes

```yaml
- id: dsh-lanmode
  config:
    mode: proxy        # proxy | direct
```

**`proxy`** (default) — something already listens on the network in front of the harness: nginx, Caddy, Tailscale serve, an SSH tunnel. The plugin only repairs the page and touches nothing else. This is the safe default: it cannot collide with whatever you already run.

**`direct`** — no proxy anywhere. The plugin opens a listener of its own and forwards to the harness, rewriting `Host` and `Origin` to the loopback authority so the harness's same-origin fence is satisfied:

```yaml
- id: dsh-lanmode
  config:
    mode: direct
    directHost: '0.0.0.0'   # every interface
    directPort: 3088
```

Then open `http://<the machine's IP>:3088` from any device on the network.

A listener rather than rebinding the harness itself, for two reasons: a bind host lives in the config tree and cannot be a switch inside the plugin, and rebinding to `0.0.0.0` collides with a reverse proxy already holding that port.

Changing the mode takes effect on restart.

## Settings

All of it can be edited as the `dsh-lanmode` namespace — in `$DSH_HOME/settings.yaml`, or from the UI once the settings pages work.

| Setting | Default | Meaning |
|---|---|---|
| `mode` | `proxy` | `proxy` or `direct` |
| `directHost` | `0.0.0.0` | `direct`: which address to listen on |
| `directPort` | `3088` | `direct`: which port to listen on |
| `settings` | `true` | return the settings service |
| `randomUuid` | `true` | provide `crypto.randomUUID` on plain HTTP |
| `clipboard` | `true` | provide a clipboard fallback on plain HTTP |

## Checking it

- `?lanmode=invert` — report the loopback flag as `false` even on localhost. The harness then fails exactly the way it does over the LAN; this is how the plugin is verified.
- `?lanmode=off` — stand the plugin down entirely, to see the page as it would be without it.

On a loopback page the plugin substitutes `true` where the real value is already `true`, so it cannot change behaviour there.

## What it is not

**Not authentication.** It adds no password and does not widen what the server accepts — the harness answers those same calls with or without it. `direct` mode does make the harness reachable by anyone who can reach that port, exactly as a reverse proxy would. If other people share your network, put a real gate in front of the harness. A plugin cannot do that job: the web server hands plugins their own routes and no way to intercept anyone else's.

**No microphone over plain HTTP.** Browsers withhold `navigator.mediaDevices` outside a secure context, so voice input plugins stop working on a plain-HTTP LAN address. Nothing can polyfill that. If you need the microphone, keep HTTPS in front and use `proxy` mode.

## Install

```bash
dsh plugin --profile web add @goodandready/dsh-lanmode
```

Restart the harness, then reload the browser.

## License

MIT
