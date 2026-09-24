# Nginx in front of dsh-lanmode

Use this when `mode` is `proxy`: Nginx (or equivalent) already listens on the
network, and dsh-lanmode only repairs the page. Buffering and short read
timeouts break LLM token streams and WebSockets.

## Checklist

- `proxy_http_version 1.1`
- WebSocket upgrade headers
- `proxy_buffering off` for the app (SSE must flush)
- `proxy_read_timeout` and `proxy_send_timeout` long enough for a chat turn
- Forward `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`
- Put Nginx on loopback from the harness point of view, and list that address
  in `trustedProxyCidrs` if you rely on `X-Forwarded-For`

## Example

```nginx
map $http_upgrade $connection_upgrade {
  default upgrade;
  ""      close;
}

server {
  listen 443 ssl;
  server_name dsh.example;

  # ssl_certificate / ssl_certificate_key: your public certs

  location / {
    proxy_pass http://127.0.0.1:3080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
```

Point `proxy_pass` at the harness port (often 3080) or at the dsh-lanmode
direct listener when you terminate TLS in Nginx and forward inward.
