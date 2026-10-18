# External clients (live control)

Your own programs can drive the entertainment area in real time: a music
visualiser, a game, screen capture, a training app. They connect to Home
Assistant's WebSocket API, claim control, and stream colour frames. The
integration sends them to the Hue bridge over the entertainment stream.

Only one source drives the lights at a time. The newest wins, and a client that
loses control is told why, so it can decide what to do next.

## Before you start

- **A dedicated user**: Home Assistant tokens carry all rights of their user, so
  don't give a client an admin token. Create a separate user for your clients
  (Settings, People, Users, Add user) with **Administrator** off and, if the
  client runs on your own network, **Can only log in from the local network** on.
  Live control and reading state work for non-admin users; everything that
  changes the setup (area, sync, scenes, override) stays admin-only. A non-admin
  user can still control your devices through Home Assistant, so keep the token
  private all the same.
- **Token**: log in as that user and create a long-lived access token under
  Profile, Security, Long-lived access tokens. Keep it out of your code and shell
  history; read it from an environment variable or a file only you can read.
- **Entertainment area**: select one in the Hue Entertainment panel (or with the
  Entertainment zone select). Claiming fails without one.
- **WebSocket URL**: `ws://<home-assistant>:8123/api/websocket`
  (`wss://` when Home Assistant uses HTTPS).

## Connecting

This is Home Assistant's standard WebSocket handshake:

1. The server sends `{"type": "auth_required", ...}`.
2. You send `{"type": "auth", "access_token": "<token>"}`.
3. The server answers `{"type": "auth_ok", ...}` (or `auth_invalid`).

After that every message you send has a unique, increasing `id`, and Home
Assistant answers each with `{"id": <id>, "type": "result", "success": true|false, ...}`.

## Commands

All commands take an optional `entry_id` to pick a bridge; with one bridge
you can leave it out.

### Claim control: `ha_hue_entertainment/live/claim`

```json
{"id": 1, "type": "ha_hue_entertainment/live/claim", "name": "My visualiser"}
```

| Field | | |
|---|---|---|
| `name` | required | Shown in the panel ("Live · My visualiser") and in other clients' `control_lost` reasons |
| `start` | optional, default `true` | Turn sync on if it's off (allowed for non-admin clients too) |

This is a **subscription**: control is yours while it is open. After the result
you receive events with the same `id`:

```json
{"id": 1, "type": "event", "event": {"type": "claimed", "client_id": "3f2c…", "zone": {…}}}
```

`zone` is the entertainment area's layout. Each entry in `zone.channels` is one
channel you can colour:

| Field | Meaning |
|---|---|
| `id` | Channel id, used in frames |
| `placed` | `{x, y, z}` where the channel is in the room, as set in the Hue app: x left (-1) to right (+1), y back (-1) to front/TV (+1), z floor (-1) to ceiling (+1). Use this for position-based effects |
| `position` | The bridge's own channel centre (less accurate for gradient lights) |
| `light`, `light_id` | The light it belongs to. Gradient lights have several channels with the same `light_id` |
| `segments` | Which segments of a gradient light the channel covers |

`zone.lights` lists each light with its placement (`positions`, two points for
gradient lights) and `segment_count`.

If something else takes over, you receive:

```json
{"id": 1, "type": "event", "event": {"type": "control_lost", "reason": "scene 'Aurora' was started"}}
```

After `control_lost` your frames are refused. Claim again to take control back,
or stop.

### Send a frame: `ha_hue_entertainment/live/frame`

```json
{
  "id": 7,
  "type": "ha_hue_entertainment/live/frame",
  "client_id": "3f2c…",
  "channels": {"0": [255, 0, 0], "3": "#00ff00", "4": [0, 0, 255, 128]},
  "brightness": 0.8
}
```

| Field | | |
|---|---|---|
| `client_id` | required | From the `claimed` event |
| `channels` | optional | Colour per channel id. Channels you leave out keep their colour |
| `all` | optional | One colour for every channel, applied before `channels` |
| `brightness` | optional | Overall brightness, 0 to 1 |

Colours are `[r, g, b]` (0 to 255), `[r, g, b, brightness]` where the 4th value
(0 to 255) is multiplied into the colour, `"#rrggbb"` or `"#rrggbbBB"`.

Frames from anyone but the current holder fail with "Not in control; claim live
control first".

**Rate**: the integration sends to the bridge about 50 times a second and the
bridge updates the lights about 25 times a second, so 25 to 50 frames per second
is plenty. Each frame gets a `result` reply; you don't have to wait for it
before sending the next one. Between frames the lights keep the last colours.

### Release: `ha_hue_entertainment/live/release`

```json
{"id": 20, "type": "ha_hue_entertainment/live/release", "client_id": "3f2c…"}
```

Gives control back. Closing the claim subscription
(`{"type": "unsubscribe_events", "subscription": 1}`) or disconnecting does the
same. The lights keep the last frame.

### Take control away: `ha_hue_entertainment/live/revoke`

Ends the current client's control (the panel's **Take over** button). Optional
`reason`, which the client receives in `control_lost`. Admin only.

## Who wins

| Event | Effect on a live client |
|---|---|
| Another client claims | Takes over; you get `control_lost` |
| A scene is started (panel, light effect, `play_scene`) | Takes over |
| `set_colors` **without** overlay, or a new colour on the Entertainment light | Takes over |
| Sync stopped or the Entertainment light turned off | Takes over |
| The entertainment area is changed | Takes over (the layout is different) |
| Another app (Hue app, Sync Box) takes the bridge | Takes over |
| `set_colors` **with** overlay, painting in the panel | No effect: drawn on top of your frames |
| Brightness changes | No effect |

There is no timeout: a client that stops sending keeps control until it
releases, disconnects or something takes over.

**Don't fight**: if your client reclaims automatically after `control_lost`,
wait a few seconds first, and never let two auto-reclaiming clients run at the
same time; they would take control from each other forever.

## Reading state without control

`ha_hue_entertainment/subscribe` (optionally `{"colors": false}`) pushes
`{"type": "status", ...}` on every change, including who is in control
(`live: {"client", "since"}`), and `{"type": "colors", "channels": {...}}` with
what the lights show, up to 20 times a second. `ha_hue_entertainment/status`
returns the same status once, with the zone layout in `zone_layout`.

## Minimal Python example

```python
import asyncio, json, math, os
import websockets  # pip install websockets

async def main():
    url = os.environ.get("HA_URL", "http://homeassistant.local:8123")
    async with websockets.connect(url.replace("http", "ws", 1) + "/api/websocket") as ws:
        await ws.recv()  # auth_required
        await ws.send(json.dumps({"type": "auth", "access_token": os.environ["HA_TOKEN"]}))
        assert json.loads(await ws.recv())["type"] == "auth_ok"

        await ws.send(json.dumps({"id": 1, "type": "ha_hue_entertainment/live/claim",
                                  "name": "Example"}))
        claimed, lost = asyncio.Event(), asyncio.Event()
        state = {}

        async def reader():
            # Keep reading: Home Assistant replies to every frame, and a client
            # that doesn't read its replies can get disconnected.
            async for raw in ws:
                msg = json.loads(raw)
                if msg.get("type") != "event":
                    continue
                event = msg["event"]
                if event["type"] == "claimed":
                    state.update(client_id=event["client_id"],
                                 channels=event["zone"]["channels"])
                    claimed.set()
                elif event["type"] == "control_lost":
                    print("Control lost:", event["reason"])
                    lost.set()

        task = asyncio.create_task(reader())
        await claimed.wait()
        for n in range(2, 2 + 25 * 30):  # 30 seconds at 25 fps
            if lost.is_set():
                break
            t = n / 25
            frame = {
                str(ch["id"]): [round(127 + 127 * math.sin(t + ch["placed"]["x"] * 3)), 40, 200]
                for ch in state["channels"]
            }
            await ws.send(json.dumps({"id": n, "type": "ha_hue_entertainment/live/frame",
                                      "client_id": state["client_id"], "channels": frame}))
            await asyncio.sleep(1 / 25)
        task.cancel()  # leaving the "with" disconnects, which releases control

asyncio.run(main())
```
