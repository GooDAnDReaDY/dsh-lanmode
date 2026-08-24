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
| Settings | `settings` | Hands every package a connection whose `isLoopback` reads `true`. The shared mirror, every namespace scope, the core's own pages and every plugin's settings section then behave as they do on localhost. |
| `crypto.randomUUID` | `randomUuid` | Provides an RFC 4122 v4 implementation over `crypto.getRandomValues`, which insecure origins do have. A no-op where the real one exists. |
| `navigator.clipboard` | `clipboard` | Provides a `writeText` fallback so the copy buttons keep working. A no-op where the real one exists. |

One package is excluded on purpose: deliverables, where the flag decides whether a produced file may be opened locally. Forcing it there would ask the Host to open paths on the server's desktop. Nothing else in the web UI reads the flag.

The exclusion list replaced an allow list, and the reason is worth writing down. A namespace scope is bound like this:

```js
bind(spec) {
  const ctx = this.ctx                      // the caller's context
  const connection = ctx.get('connection')
  ... connection.isLoopback ? 'host' : 'memory'
}
```

`this.ctx` belongs to whichever plugin calls `bind`, not to the settings package. Handing the substitute to the settings packages alone therefore fixed the shared mirror and the core's own pages, while every plugin's own settings section still went to memory mode and reported that the harness had not announced its settings.

## Two modes

```yaml
- id: dsh-lanmode
  config:
    mode: proxy        # proxy | direct | auto
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

**`auto`** — work it out. The plugin knocks on this machine's own network
addresses at the harness port: the harness itself listens on loopback only, so
anything answering there is a proxy, and the mode is `proxy`. When nothing
answers and the direct port is free, it is `direct`. When it cannot tell — no
addresses, no known port, a probe that errored — it picks `proxy` and opens
nothing: an unnecessary listener on a network address is an open door, and one
is not opened on a guess.

What `auto` cannot see is a proxy sitting on a *different* port. From outside
that is indistinguishable from nobody being there, and the plugin would open its
own listener beside it. Set the mode by hand in that case.

The decision is logged with its reason and shown on the diagnostics page.

Changing the mode takes effect on restart.

## HTTPS, and the microphone

This is the one thing no substitution can repair. A browser hands out
`navigator.mediaDevices` only over a secure connection, and behind it is a real
device — there is nothing to fake. Over plain HTTP on a network address, voice
input is impossible in principle.

So the direct-mode listener can speak HTTPS:

```yaml
- id: dsh-lanmode
  config:
    mode: direct
    tls: self-signed     # off | self-signed | files
```

**`self-signed`** — the plugin issues a certificate itself and keeps it in
`tlsDir` (by default a folder next to the harness data). It goes into the
certificate with every address this machine answers on, plus anything in
`tlsHosts`: a certificate issued for one name is refused for every other, even
after it has been accepted once. It is reissued when it is about to expire or
when a new address appears. The fingerprint is printed to the log at startup —
compare it in the browser instead of accepting blindly.

Issuing needs `openssl` on the machine. Without it the plugin says so plainly
and falls back to plain HTTP rather than pretending everything is fine.

**`files`** — your own certificate:

```yaml
    tls: files
    tlsCert: /path/to/cert.pem
    tlsKey: /path/to/key.pem
```

A self-signed certificate is a compromise, not a solution: the browser will
still ask. But it turns "impossible" into "confirm once", and that is the whole
difference between voice input working over the network and not.

## Who may connect

The direct listener has no password and will not get one: the plugin does not
intercept anyone else's routes, and inventing its own way into the harness is
not its business. But between "no password" and "anyone on the network" there is
room:

```yaml
- id: dsh-lanmode
  config:
    mode: direct
    allow:
      - 192.168.1.0/24
      - 10.0.0.5
```

Addresses and CIDR ranges, IPv4 and IPv6. An empty list means everyone, which is
how the plugin behaves until you fill it in. Refused connections are logged, at
a limited rate so a scanner cannot drown the log.

Two honest limits. This is not authentication: whoever is on the list gets in
unchecked. And behind a reverse proxy it means nothing — every request arrives
from the proxy, so filter there instead.

## Diagnostics

`GET /dsh-lanmode/health` — one page answering the questions that otherwise take
half an hour: which mode is on and why, what is patched, whether the browser
considers the connection secure, and why the microphone is silent. Add
`?format=json` for the same data in a form you can paste into a bug report.

Half the answers can only come from the browser — a secure connection and a
microphone exist nowhere else — so the page checks those in the browser that
opened it.

Nothing secret is on that page: it is open to anyone who reached the harness.
Turn it off with `diagnostics: false`.

## When the harness changes underneath

The plugin holds on to the harness's internals: the index tap, the name of the
package the substitution must leave alone, the shape of the connection object.
An upgrade can move any of them, and a plugin that repairs someone else's
behaviour must not fail quietly — that already happened once, and it took days
of confusing symptoms to notice.

So at startup it checks its own assumptions and says what it found: one line
when everything is in place, a loud complaint naming what moved when it is not.
The same list is on the diagnostics page.

## Settings

All of it can be edited as the `dsh-lanmode` namespace — in `$DSH_HOME/settings.yaml`, or from the UI once the settings pages work.

| Setting | Default | Meaning |
|---|---|---|
| `mode` | `proxy` | `proxy`, `direct` or `auto` |
| `directHost` | `0.0.0.0` | `direct`: which address to listen on |
| `directPort` | `3088` | `direct`: which port to listen on |
| `tls` | `off` | `direct`: `off`, `self-signed` or `files` — what the microphone hangs on |
| `tlsDir` | — | `self-signed`: where the issued certificate is kept |
| `tlsHosts` | `[]` | `self-signed`: extra names and addresses for the certificate |
| `tlsCert` | — | `files`: path to the certificate in PEM |
| `tlsKey` | — | `files`: path to the private key in PEM |
| `allow` | `[]` | `direct`: addresses and CIDR ranges allowed in. Empty means everyone |
| `diagnostics` | `true` | serve `GET /dsh-lanmode/health` |
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
