# Cloudflare Tunnel deployment for dsh-lanmode

This guide covers publishing DeepSeek Harness through Cloudflare Tunnel
without opening inbound router ports. It matches the built-in driver in
`lib/tunnel.js` (`CloudflareTunnel`, routes under `/dsh-lanmode/tunnel`).

## Why tunnel instead of port forwarding

- Works behind CGNAT / grey IP ISPs
- No inbound ports on the LAN router
- Cloudflare terminates TLS with a public certificate
- Built-in DDoS edge and WebSocket support
- Optional PIN gate for WAN traffic (`tunnelPin`)

## Modes

### Quick tunnel (`tunnel: "quick"`)

Spawns `cloudflared` without an account token and parses a temporary
`*.trycloudflare.com` URL from process output. Good for demos; URL
changes on restart.

Requirements:

- `cloudflared` available on `PATH`
- Outbound HTTPS to Cloudflare

### Named tunnel (`tunnel: "named"`)

Uses a Cloudflare Zero Trust tunnel token (`tunnelToken` or
`tunnelTokenRef`). Stable hostname, manageable in the Cloudflare dashboard.

## Recommended architecture

```text
Browser (WAN)
  -> Cloudflare edge (TLS)
    -> cloudflared agent on the DSH host
      -> dsh-lanmode direct listener (loopback or LAN allowlist)
        -> DeepSeek Harness core (loopback)
```

Keep `allow` restricted to loopback where possible and let Cloudflare be
the only public ingress. Enable `passwordAuth` and `tunnelPin` for WAN.

## Settings checklist

| Setting | Suggested value |
|---------|-----------------|
| `mode` | `direct` or `auto` |
| `tunnel` | `quick` or `named` |
| `tunnelToken` / `tunnelTokenRef` | set for named mode |
| `tunnelPin` | `true` |
| `passwordAuth` | `true` for WAN |
| `allow` | prefer loopback when only tunnel ingress is used |

## Operations

1. Install `cloudflared` from Cloudflare.
2. Set plugin tunnel mode in settings / config API.
3. Confirm public URL via tunnel status route / logs (`Cloudflare WAN tunnel active`).
4. Open the public URL, complete login, verify chat SSE and WebSocket.
5. Disable or rotate the named token when the publish window ends.

## Security notes

- Treat trycloudflare URLs as temporary and public.
- Do not put secrets in the tunnel hostname.
- Combine with LAN PIN / password auth; do not rely on obscurity.
- `isCloudflareRequest()` detects `CF-Connecting-IP` / `CF-Ray` for WAN-specific policy.
