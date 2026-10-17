# Hue Entertainment for Home Assistant

Stream colours and position-based animations to a Philips Hue **entertainment
area** through the Hue Entertainment API (a DTLS stream to the bridge), instead
of ordinary per-light commands. Colour updates are sent ~50 times a second and
the bridge pushes about 25 updates per second to the lights, far faster than
normal light commands (about 10 per second per bridge).

> **Status: early development.** The Home Assistant integration is a skeleton;
> the standalone server below works. See [docs/PLAN.md](docs/PLAN.md).

## Install in Home Assistant (HACS custom repository)

1. HACS → ⋮ → Custom repositories → add this repository's URL, category **Integration**.
2. Install **Hue Entertainment** and restart Home Assistant.

Setup (bridge pairing, zones, sync, scenes) is not available yet.

## Standalone server

Runs outside Home Assistant and exposes an HTTP/WebSocket API on localhost.

```
integration ──HTTP/WebSocket──▶ standalone server ──DTLS/UDP 2100──▶ Hue bridge ──▶ lights
                                  (port 8080)
```

### Setup

Python 3.13 (see `.python-version`). DTLS uses OpenSSL through `pyOpenSSL`/`cryptography`,
which have prebuilt wheels for x86_64 and aarch64 (including Alpine).

```bash
uv venv .venv && uv pip install --python .venv/bin/python -r requirements.txt  # uv reads .python-version
```

### Run

```bash
./run_server.sh            # API on http://127.0.0.1:8080, docs at /docs
```

First time: call `GET /api/v1/bridges/discover`, press the link button on the
bridge, then call `POST /api/v1/bridge/pair` with its address. Then select a zone
and start the stream. You can do all of this from the interactive docs at `/docs`.

The keys are stored in `data/config.json` with mode 600. Set
`HUE_ENTERTAINMENT_CONFIG` to use another file, e.g. `/data/config.json` in a
Home Assistant add-on. Entertainment zones are created in the Hue app under
Settings → Entertainment areas.

While syncing, the bridge reserves those lights for the stream. Normal control
from the Hue app, Home Assistant or scenes is paused until you stop it.

A bridge runs one entertainment stream at a time. If another app (for example
a Hue Sync Box) is streaming, start returns 409 naming the area and app.

### Reliability

- **Bridge moved:** if the saved IP stops answering, the server finds the bridge
  again by its ID via mDNS and saves the new address.
- **Stream dropped:** once started, a watchdog keeps the stream alive. If the
  bridge reboots, drops the session or another app takes over, it reconnects
  with backoff (2 s up to 30 s) until you call stop. `status.streaming.state`
  is `off`, `streaming` or `reconnecting`, with the last error.
- **Logs** go to stdout.

### API

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/v1/status` | | bridge, zone, stream state, rates |
| GET | `/api/v1/bridges/discover` | | find bridges on the local network (mDNS) |
| POST | `/api/v1/bridge/pair` | `{"host": "192.168.1.20"}` | pair; returns **428** until the link button is pressed |
| DELETE | `/api/v1/bridge` | | forget the bridge |
| GET | `/api/v1/zones` | | list entertainment zones |
| POST | `/api/v1/zone` | `{"zone_id": "…"}` | select zone (not while streaming) |
| GET | `/api/v1/zone` | | selected zone: channels, positions (x,y,z in −1..1), light names |
| POST | `/api/v1/stream/start` | `{"fps": 50}` | start sync (1–60 packets/s to the bridge) |
| POST | `/api/v1/stream/stop` | | stop sync; lights return to normal control |
| GET | `/api/v1/colors` | | current frame |
| PUT | `/api/v1/colors` | see below | set colours |
| WS | `/api/v1/ws` | | high-rate frames + live state |

Colours are `[r, g, b]` in 0–255 or `"#rrggbb"`, with an optional 4th value for
brightness (0–255, multiplied into the colour; not alpha): `[255, 0, 0, 128]` or
`"#ff000080"`. Unlisted channels keep their colour, and `all` is applied before
`channels`:

```json
{"all": [0, 0, 0], "channels": {"0": [255, 0, 0], "3": "#00ff00"}, "brightness": 0.8}
```

**WebSocket** (`ws://127.0.0.1:8080/api/v1/ws`) messages:

- Client to server:
  - `{"type": "colors", ...same fields as PUT}`
  - `{"type": "subscribe", "colors": true}`
  - `{"type": "ping", "id": 1}`
- Server to client:
  - `{"type": "status", ...}` on every change and once a second
  - `{"type": "colors", "channels": {...}}` at up to 20 Hz, if subscribed
  - `{"type": "pong"}`
  - `{"type": "error", "message": ...}`

Use the WebSocket for anything animated. REST is fine for occasional changes.
Error codes: 400 bad input, 409 bridge/state problem, 428 press the link button.

**Localhost only.** The server has no authentication, so it only listens on
127.0.0.1. Other devices on your network can't reach it.

## Files

- `custom_components/ha_hue_entertainment/core/`: bridge (discovery, pairing, CLIP v2 REST),
  stream (HueStream v2, DTLS-PSK via pyOpenSSL), engine (state, lifecycle, watchdog, colour buffer).
  No Home Assistant imports, shared by the integration and the standalone server.
- `standalone/server.py`: FastAPI HTTP and WebSocket layer for use outside Home Assistant

## Licence

MIT, see [LICENSE](LICENSE).
