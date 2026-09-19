# Yuki WebUI

The web dashboard for the Yuki ecosystem: a small Flask app serving a static/JS dashboard that
talks to `yuki-core` directly over WebSocket for real-time device state, commands, metrics, groups,
tags, and admin actions (approve/blacklist devices, rotate the token, audit log).

## Requirements

Python 3.10+, dependencies pinned in `requirements.txt` (`Flask==3.1.3`, `Werkzeug==3.1.8`,
`requests==2.34.2`, `psutil==7.2.2`).

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Binds to `127.0.0.1:5000` by default.

## Login

Ships with a default login of **`admin` / `admin`** (stored hashed, not plaintext, from first run
onward) so it works out of the box - **change it** from the dashboard's Settings panel once you've
logged in. You can also bypass the file-based credentials entirely by setting `WEBUI_USER`/
`WEBUI_PASS` env vars.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | (auto-generated) | Flask session signing key. If unset, a random key is generated once and persisted to `.flask_secret` (mode 600). |
| `WEBUI_USER` / `WEBUI_PASS` | unset | Override the `.credentials` file entirely. |
| `YUKI_WEBUI_DEBUG` | unset | Enables Flask's debug mode (interactive debugger - only for local development, never expose this). |
| `YUKI_WEBUI_HOST` | `127.0.0.1` | Bind address. Set to `0.0.0.0` to reach it from other devices on your LAN. |
| `YUKI_WEBUI_TLS_ENABLED` | unset | When truthy, serves HTTPS instead of HTTP - requires the two variables below. If set without both of those, the app refuses to start (`RuntimeError`) rather than silently serving plain HTTP. |
| `YUKI_WEBUI_TLS_CERT` / `YUKI_WEBUI_TLS_KEY` | unset | PEM certificate/key paths used when TLS is enabled. |
| `YUKI_CORE_TOKEN_FILE` | `../yuki-core/.token` (relative to this repo) | Where to read `yuki-core`'s auth token from, to authenticate the dashboard's own `/webui` WebSocket connection. Override this if `yuki-core` isn't checked out next to this repo. |

Encryption is **off by default**, matching the rest of the ecosystem; `SESSION_COOKIE_SECURE`
automatically follows `YUKI_WEBUI_TLS_ENABLED`. The dashboard's Settings page has an **Encryption**
card showing whether the page itself (HTTP/HTTPS) and its connection to `yuki-core` (`ws`/`wss`) are
currently encrypted - it's read-only (flipping either one for real needs both processes restarted
with the env vars above), but it's the one place that tells you the true state instead of leaving
you to assume TLS is on just because you meant to turn it on.

`yuki-core` also checks the `Origin` header on the `/webui` socket (see its own README,
`YUKI_WEBUI_ALLOWED_ORIGINS`) - if you bind this app to a non-default host/port, update that
variable on the `yuki-core` side or the dashboard's socket connection will be rejected.

## How it connects to `yuki-core`

The dashboard's real-time features run over a direct browser → `yuki-core` WebSocket connection to
`/webui` (not proxied through this Flask app). Since that socket carries privileged actions, the
browser authenticates it right after opening: it fetches the current core token from this app's own
`GET /api/core-token` (which requires you to already be logged in here) and sends it as the first
message on the socket. `yuki-core` verifies it before accepting anything else.

## Data files

`dashboard_data.json` (groups/tags/widget layout), `.credentials` (hashed username/password, mode
600), `.flask_secret` (mode 600), `logs/` (one file per run).

## Protocol

Speaks Yuki Protocol `yuki/1.0` via the `static/libs/yuki-protocol` git submodule
([VLPLAY-Games/yuki-protocol](https://github.com/VLPLAY-Games/yuki-protocol), Python for the
backend's own message helpers, JavaScript for the browser) - see
[`yuki-protocol`](../yuki-protocol).

## License

GNU General Public License v3.0 (GPLv3), same as the rest of the Yuki ecosystem - see
[yuki-system](https://github.com/VLPLAY-Games/yuki-system) for details.
