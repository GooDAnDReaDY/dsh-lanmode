# dsh-lanmode

**Settings over the LAN** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh).

Open the Web UI at `http://192.168.1.50:3080` instead of `http://localhost:3080` and every settings card in the deployment goes blank — your plugins' cards, and **Settings → Plugins → Plugin configuration** with them. No error appears, the plugins load fine, and reloading does not help. Saving silently does nothing.

This plugin fixes that. Install it, reload the page, and the settings work from any address.

## Why it happens

The decision is made in the browser, from the page's hostname:

```js
isLoopback: pageLocation === undefined || isLoopbackHostname(pageLocation.hostname)
```

`isLoopbackHostname` accepts `localhost`, `[::1]` and `127.0.0.0/8` — nothing else. A page served at a LAN address is therefore "remote", and the settings service switches to a process-local mode where the shared mirror of the settings document is never read at all:

```js
ensure() { if (this.persistence === "memory") return Promise.resolve() }
status: persistence === "host" ? "loading" : "unavailable"
enqueue() { if (this.persistence === "memory") return Promise.resolve() }
```

Every bound namespace reports `status: "unavailable"` for the life of the page, and writes are dropped before they reach the wire.

**The server does not share this restriction.** Both `settings.describe` and `settings.mutate` answer normally over the network as long as the request's `Origin` matches the page it came from — which is exactly the case for requests the UI itself makes. Verified against a live harness behind a reverse proxy.

## What the plugin does

It injects one script into the served `index.html`, through the web server's official index tap, ahead of the boot manifest. The script intercepts module registration and hands the two settings packages a connection whose `isLoopback` reads `true`. Everything downstream — the shared mirror of the settings document, every namespace scope, the core's own settings pages — then behaves exactly as it does on localhost.

The substitution is narrow on purpose. Three packages read that flag, and the third is deliverables, where it decides whether a produced file may be opened locally: forcing it there would ask the Host to open paths on the server's desktop. Only the settings packages see the substitute; the rest of the UI keeps the truth.

Taking the core settings service over instead is not possible — cordis refuses a second provider for a registered name, and refuses assignment across fibers.

## Checking it

- `?lanmode=invert` — report the flag as `false` even on a loopback page. The harness then fails exactly the way it does over the LAN, which is how this plugin is verified.
- `?lanmode=off` — stand the plugin down entirely.

On a loopback page the plugin substitutes `true` where the real value is already `true`, so it cannot change behaviour there.

## What it is not

Not authentication. The plugin does not add a password and does not widen what the server accepts — the harness answers those same calls with or without it. If your harness is reachable by other people, put a real gate in front of it (HTTP auth in your reverse proxy, or a VPN); a plugin cannot do that job, because the web server service hands plugins their own routes and no way to intercept anyone else's.

## Structure

```
dsh-lanmode/
├── package.json            # dsh bundle/plugin metadata
├── cordis.patch.yml        # bundle layer: inserts the plugin row
├── lib/index.js            # host: nothing but a log line — the work is in the browser
├── lib/client.js           # browser: the settings mirror and namespace scopes
├── README.md
└── LICENSE                 # MIT
```

## License

MIT
