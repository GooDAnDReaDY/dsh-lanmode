# Listening address

`directHost` chooses where mode `direct` binds.

| Value | Meaning |
|-------|---------|
| `127.0.0.1` | loopback only (default) |
| `0.0.0.0` | every IPv4 interface |
| a specific LAN address | one interface |

`allow` is a separate allowlist (CIDR). Binding to `0.0.0.0` does not by
itself admit the LAN: keep `allow` tight.

This plugin does not read `cordis.patch.yml` for the bind. Set `directHost`
and `directPort` in the plugin config (settings card or
`PATCH /dsh-lanmode/api/config`). Changing the bind restarts the listener.
