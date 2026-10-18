# Plan: ha-hue-entertainment

Status: draft v3. All planning questions answered; step 0 partly done.

## Goal

Anyone can install it from HACS (as a custom repository for now). It adds an
admin-only sidebar item that opens a full-screen panel, like WashData, where the
user connects a Hue bridge, picks an entertainment zone, turns sync on and off,
and plays position-based animated scenes. The same controls are available to
the rest of Home Assistant as entities and services. Builders get a realtime
interface for their own effects.

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Form | HACS custom integration running inside Home Assistant (like WashData), as far as features allow |
| 2 | Standalone | Keep a standalone server as well. Core lives in `custom_components/ha_hue_entertainment/core/`, the standalone server imports it (one repo) |
| 3 | Hardware | Decide later; step 0 measures performance on whatever we test on |
| 4 | Repository | Turn the current repo into `ha-hue-entertainment` (keeps history), public, HACS custom repository for now |
| 5 | Domain / licence | `ha_hue_entertainment`, MIT |
| 6 | Bridges | One bridge for now; keep code ready for several (bridge-keyed state, no globals) |
| 8 | HA Hue integration | Pair separately; reuse of its connection is a later item |
| 9 | Override | Setting: may the integration stop another app's sync (e.g. Hue Sync Box)? Off → report busy. After our sync stops, restore only the lights' previous state; a stopped Sync Box session is not resumed. When another app takes over from us, we accept it and turn sync off (no reconnect); reconnecting is only for failures such as an unreachable bridge |
| 10 | Scene format | JSON to start; extend later if it falls short |
| 11 | Entity model | Follow Home Assistant conventions (below), including a `light` entity with scenes as effects. What the lights show when sync is on but nothing sends is a user setting (hold last colours / dark / default scene) |
| 12 | Scene settings | Adjustable entities (brightness, speed, …) |
| 13 | Scenes storage | Built-in scenes ship with the integration; user scenes are JSON files in `/config/ha_hue_entertainment/scenes/`, read at startup and reload. A user scene with the same id replaces the built-in. Import/export actions and URL import later |
| 19 | Overlay | `set_colors` with `overlay: true` draws the given channels on top of a running scene (solid colour), optionally for a `duration`; without overlay, colours replace the scene |
| 14 | Later | Restart behaviour, multiple bridges, reuse of HA's Hue integration, scene editor |
| 7 | Builder socket | Home Assistant WebSocket API by default; UDP (DDP/E1.31) as a possible later opt-in |
| 18 | Multiple sources | One source at a time; newest wins, the previous one is told it lost control |
| 17 | Panel access | Admins only |
| 15 | Frontend | Home Assistant default: Lit web components |

## Architecture

```
ha_hue_entertainment/          (repo ha-hue-entertainment)
├── custom_components/ha_hue_entertainment/
│   ├── core/                  bridge, DTLS stream, engine, scene engine (no HA imports)
│   ├── __init__.py, config_flow.py, light.py, select.py, number.py, switch.py, sensor.py
│   ├── services.yaml, websocket_api.py, panel/ (Lit frontend bundle)
│   └── manifest.json          no pyOpenSSL/cryptography pins: Home Assistant already ships them
└── standalone/                FastAPI server using the same core/
```

- The core library has no Home Assistant imports, so the integration and the
  standalone server use the same bridge, stream and scene code.
- The DTLS sender runs in its own thread so it never blocks Home Assistant's event loop.
- The panel talks to the integration over Home Assistant's WebSocket API with
  custom commands, like WashData. Authentication comes from Home Assistant, so
  the "localhost only, no auth" limitation goes away.

### Entity model

Per entertainment zone (one device per bridge, zones as its entities):

- `select` **Entertainment zone**: which zone to stream to
- `select` **Scene**: the animated scene to play (includes "None")
- `light` **Entertainment**: on/off starts/stops sync; brightness, colour, and the scenes as `effect`s.
  This is how Home Assistant models effect-capable lights (WLED, Hue, LIFX),
  so dashboards, voice assistants and automations work with it out of the box.
- `number` **Brightness**, **Speed**: settings of the running scene
- `switch` **Allow override**: may sync stop another app's stream (decision 9)
- `select` **When idle**: what the lights show when sync is on but nothing sends (hold last / dark / default scene)
- `sensor` **Stream state**: off / streaming / reconnecting / busy, with attributes for who holds the bridge
- Services: `play_scene` (scene + parameters), `stop_scene`, `set_colors`, `import_scene`, `export_scene`

### Builder interface

What others do:
- **Home Assistant WebSocket API.** Integrations add custom commands, and
  clients authenticate with a long-lived access token. WashData's panel uses
  this route. Pros: secure, no extra port, works through any HA access path
  (including remote). Cons: JSON over WebSocket, fine for ~25–60 frames/s.
- **Light-show UDP protocols.** WLED, Hyperion, LedFx and xLights use DDP, E1.31
  (sACN) or Art-Net. Pros: existing effect software could drive the lights
  directly. Cons: no authentication, so local network and opt-in only.

Default: the Home Assistant WebSocket API. A UDP protocol (DDP or E1.31) can be
added later as an opt-in for compatibility with existing light-show software.
"One source at a time, newest wins" applies to both.

## Steps

### 0. Validation spikes (before building)
- [x] pyOpenSSL in Home Assistant: HA core itself depends on `pyopenssl==26.4.0` and
      `cryptography==50.0.1` (dev branch, Python >=3.14.2, checked 2026-10-17). The PSK setup builds the
      same DTLS ClientHello on Python 3.14 with those versions. The integration should not pin these
      itself; it uses what HA ships. Still to do: a live stream from inside a real HA install
- [x] Override: stopping another app's stream works. `PUT entertainment_configuration/<id> {"action": "stop"}`
      on the Sync Box's area made it inactive at once (2026-10-17); the Sync Box did not take it back within 20 s
- [x] Restore after stop: the bridge itself puts the lights back to their previous state (on, brightness,
      colour) when a stream stops; confirmed via the API and visually (2026-10-17)
- [ ] Frame timing: 25–50 frames/s from a thread inside HA without hurting its responsiveness
- [ ] Check what HA's built-in Hue integration exposes for entertainment areas
      (decision 8), to avoid duplicates and check reuse options

### 1. Repository and packaging
- [x] Rename the current repo to `ha-hue-entertainment`, MIT licence
- [x] Move core code into `custom_components/ha_hue_entertainment/core/`; standalone server on top
- [x] `hacs.json`, manifest, hassfest + HACS validation GitHub Actions
- [ ] Release workflow (with the first release)

### 2. Bridge setup (config flow)
- [x] Auto-discover bridges via Home Assistant's zeroconf (`_hue._tcp`), manual IP fallback
- [x] "Press the link button" step creating the app key and streaming key
- [x] IP changes followed via zeroconf and re-discovery by bridge ID; remove = Home Assistant's delete
- [x] State keyed by bridge ID, so several bridges can be added later
- [x] Connect on load, bridge registered as a device, retry when unreachable
- Re-pairing and Reconfigure moved to step 7 (parked as a git stash)

### 3. Entities and services
- [x] Entertainment zone select (switching zones while syncing moves the stream)
- [x] Light entity: on/off = sync on/off, colour and brightness for the whole area, kept across restarts
      (replaces the separate sync switch)
- [x] Busy reporting: starting while another app syncs fails with "busy: <area> by <app>"
- [x] Another app taking over (Hue app, Sync Box) turns sync off instead of fighting back
- [x] Scenes as effects of the Entertainment light; Scene speed slider (brightness is the light's own)
- [x] `play_scene` (with parameters and speed) and `stop_scene` actions
- [ ] When-idle select
- [ ] Stream state sensor (off / streaming / reconnecting, holder, last error), moved back on request
- [x] `set_colors` service: per-channel and whole-area colours, optional per-colour brightness;
      channel ids listed in the light's `channels` attribute
- [ ] Import/export actions
- [x] Allow override setting (decision 9): a configuration switch; when on, starting sync or switching
      zones stops another app's stream first. Automatic reconnects never override
- [x] Restore the lights' pre-sync state after stopping: the bridge does this itself, nothing to build

### 4. Sidebar panel (admins only, Lit)
- [x] Sidebar item and full-screen panel (TypeScript + Lit + Vite, committed panel.js)
- [x] Bridge card with a link to Devices and services for pairing
- [ ] Live top-view preview of the lights by position; click to paint
- [x] Entertainment area picker, Sync and Allow override toggles, state pill, message bar for errors
- [ ] Scene library: list, preview, play, stop, import, export
- [ ] Settings: frame rate, default brightness

### 5. Animated scenes (JSON)
- [x] JSON scene format v1 (documented in `core/scenes.py`): parameters, play-once or loop, layers
      solid / gradient / band / noise / flash with normal / add / max blending
- [x] Scene engine: computes each channel's colour from its position and time for every packet
- [x] First built-in scenes: Sweep, Aurora, Thunderstorm (tested on real lights)
- [x] Load user scenes from `/config/ha_hue_entertainment/scenes/` (created on setup); invalid files logged
- [x] Overlay (decision 19): `overlay`, `duration` and `clear_overlay` on set_colors
- [ ] Later: import / export actions

### 6. Builder interface
- [ ] WebSocket commands: get zone layout, claim control, send frames, release
- [ ] "Newest wins": a new claim takes over; the previous client gets a `control_lost` event
- [ ] Documentation and a small example client

### 7. Hardening and release
- [ ] Watchdog/recovery (already built), diagnostics download, repair issues in HA
- [ ] Re-pairing when the bridge rejects the key (reauth) and Reconfigure to change the IP by hand
      (written and parked in `git stash`: "block 6: reauth and reconfigure flows (parked)")
- [ ] First add of a bridge once hung in setup until a restart (2026-10-17); not reproducible since, keep an eye on it
- [ ] Tests: packet building, colours, scene engine, config flow
- [ ] README with screenshots; first release as HACS custom repository

### Later
- Restart behaviour, scene editor with live preview, several bridges,
  reuse of HA's Hue connection, UDP protocol for light-show software,
  submission to the HACS default list

## Scene format draft (to refine in step 5)

```json
{
  "format": 1,
  "id": "sweep_lr",
  "name": "Sweep left to right",
  "parameters": {
    "color": {"type": "color", "default": "#ff7a00"},
    "speed": {"type": "number", "min": 0.1, "max": 4, "default": 1},
    "width": {"type": "number", "min": 0.1, "max": 2, "default": 0.4}
  },
  "layers": [
    {"type": "sweep", "axis": "x", "from": -1.2, "to": 1.2, "period": "2s / speed",
     "color": "$color", "width": "$width"}
  ]
}
```

## User stories

**New user / installer**
- As a Home Assistant user, I add the repository to HACS, install, and restart, without touching files.
- As a new user, my Hue bridge is found automatically and I only press the link button.
- As an admin, I see a "Hue Entertainment" sidebar item that opens one place to manage everything.
- As a user, when something goes wrong (bridge unreachable, another app streaming), I'm told what and who.

**Everyday user**
- As a user, I pick the entertainment zone and turn sync on and off from the panel or a dashboard.
- As a user, I play an animated scene, such as a sweep across the room, and stop it again.
- As a user, I adjust brightness and speed of a running scene with sliders.
- As a user, I choose whether sync may stop another app such as the Hue Sync Box; if not, I see "busy".
- As a user, when sync stops, my lights go back to how they were before.

**Automation author**
- As an automation author, I start/stop sync, select the zone and play/stop scenes from automations and scripts.
- As an automation author, I trigger on stream state (for example when the Sync Box takes over).

**Builder**
- As a builder, I connect to Home Assistant's WebSocket with a token and stream per-light colours.
- As a builder, I read the zone layout (channel ids, positions, light names) to make position-based effects.
- As a builder, I know when another source takes control from me.

**Scene creator / sharer**
- As a scene creator, I write a JSON scene once and it adapts to any room, because it uses positions.
- As a scene creator, I export a scene as a file; others import and play it.

## Open questions

None.
