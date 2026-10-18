# Hue Entertainment for Home Assistant

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/docs/faq/custom_repositories/)
[![Validate](https://github.com/Rens-br/ha-hue-entertainment/actions/workflows/validate.yml/badge.svg)](https://github.com/Rens-br/ha-hue-entertainment/actions/workflows/validate.yml)
[![License](https://img.shields.io/github/license/Rens-br/ha-hue-entertainment)](LICENSE)

Drive a Philips Hue **entertainment area** from Home Assistant: colours,
animated scenes that move through the room, and live control from your own
programs using the fast stream the Hue Sync apps use: about 50 updates a second to the bridge, which updates the lights about 25 times a second.

> **AI Notice:**
This integration is largely coded by AI but with supervision and my own coding here and there, because I mainly intended it for my own use. If there is enough interest in this project I will dedicate more of my time to it.

## What you get
- **Home Assistant entities** an Entertainment light (with the scenes as effects), the area, scene speed and an allow-override setting.
- **A sidebar panel** to pick the entertainment area, turn sync on and off, see a live 3D-style view of the room with every light in its place and colour, paint lights, and play scenes with their own settings.
- **Animated scenes** that use where your lights are: a sweep across the room, aurora curtains, a thunderstorm with lightning that rolls through the room.
Write your own as JSON files.
- **Actions** for automations: set colours per light (or draw an overlay on top of a running scene, for example as a notification), play and stop scenes.
- **Live control** for your own programs (visualisers, games, training apps) over Home Assistant's WebSocket.
- **Plays nicely with a Hue Sync Box**: starting while another app syncs gives a clear "busy" message, and when another app takes over, sync turns off instead of fighting back. Optionally allow taking over.

## Planned features
The following features are currently planned to be added, but might change in the future:
- **Custom light positioning:** Allowing to change the light positions from the panel, to be able to place them better, and enable more support for non-square rooms.
- **Non-entertainment zone lights:** Allowing to add lights that are not in the entertainment zone, while they would be more restricted. (using normal light commands, which the bridge limits to about 10 updates a second)
- **Additional scene features:** Brightness layers to control brightness from noise.
- **Scene transitions**: fade into a new scene instead of switching instantly.
- **Import and export** of scene files from the panel, later I want to make it easier to find and share scenes. 
- **Multiple bridges** Allowing to add multiple bridges, allowing for larger entertainment zones if possible.

## Requirements

- A Philips Hue bridge with at least one **entertainment area**, created in the Hue app under Settings, Entertainment areas. The area also sets where each light is in the room.
- Home Assistant. Developed and tested on **2026.10** (Home Assistant OS).
- Home Assistant and the bridge on the same network.

## Installation

### HACS (recommended)

[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Rens-br&repository=ha-hue-entertainment&category=integration)

Or by hand:

1. In HACS, open the menu (⋮), **Custom repositories**, add
   `https://github.com/Rens-br/ha-hue-entertainment` with type **Integration**.
2. Search for **Hue Entertainment** and download it.
3. Restart Home Assistant.

### Manual

1. Copy `custom_components/ha_hue_entertainment` into your Home Assistant
   `config/custom_components/` folder.
2. Restart Home Assistant.

## Configuration

[![Open your Home Assistant instance and start setting up Hue Entertainment.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=ha_hue_entertainment)

1. Go to **Settings, Devices and services**. Your bridge usually shows up as a discovered **Hue Entertainment** card; otherwise use **Add integration** and search for it. If the bridge isn't found, enter its IP address.
2. Press the round **link button** on the bridge and select **Submit** within 30 seconds.
3. Open **Hue Entertainment** in the sidebar (admins only) and pick your entertainment area.

This integration pairs with the bridge separately from Home Assistant's built-in
Hue integration; both can be used side by side.

## The panel
![panel](<docs/images/panel.png>)

- **Sync** and **Allow override** toggles.
- **Room view**: the area like in the Hue app, with each light on a pole at its height and gradient lights as bars, coloured live. Pick a colour and select a light (or a part of a gradient light) to paint it; set the overall brightness.
- **Scenes**: play and stop, speed, and a settings form for the selected scene.

## Entities

Per bridge (entity ids depend on your bridge's name):

| Entity | What it does |
|---|---|
| `light.<bridge>_entertainment` | On: sync on, showing its colour or scene. Off: sync off, the lights return to how they were. Colour and brightness apply to the whole area. Scenes are its **effects**. The `channels` attribute lists each channel id and its light. |
| `select.<bridge>_entertainment_zone` | The entertainment area to use. Switching while syncing moves the stream. |
| `number.<bridge>_scene_speed` | Speed of the playing scene (0.1 to 4×). |
| `switch.<bridge>_allow_override` | Configuration: let starting sync stop another app’s stream, such as a Hue Sync Box. Off by default. |

While syncing, the bridge reserves the area's lights for the stream; the Hue
app, scenes and Home Assistant's Hue integration can't change them until sync
stops. When sync stops, the bridge puts them back as they were.

## Actions

### `ha_hue_entertainment.set_colors`

Set colours per channel and/or for the whole area. Starts sync if it's off.

| Field | Description |
|---|---|
| `channels` | Colour per channel id (see the light's `channels` attribute). Channels not listed keep their colour. |
| `all` | One colour for every channel, applied before `channels`. |
| `brightness_pct` | Brightness of the whole area, 0 to 100. |
| `overlay` | Draw on top of a running scene or live client instead of replacing it. |
| `duration` | Remove the overlay after this many seconds. |
| `clear_overlay` | Remove all overlays first. |

Colours are `[r, g, b]` (0 to 255), `[r, g, b, brightness]` where the 4th value
(0 to 255) dims that colour, `"#rrggbb"` or `"#rrggbbBB"`.

```yaml
action: ha_hue_entertainment.set_colors
target:
  entity_id: light.pro_bridge_entertainment
data:
  all: [255, 120, 0, 60]
  channels:
    0: [255, 0, 0]
    3: "#00ff00"
```

### `ha_hue_entertainment.play_scene`

Play a scene, optionally with its own settings. Starts sync if it's off.

| Field | Description |
|---|---|
| `scene` | Scene id or name, for example `sweep`. |
| `params` | Scene settings; anything not given keeps its default. |
| `speed` | Speed, 0.1 to 4. Also sets the Scene speed entity. |

```yaml
action: ha_hue_entertainment.play_scene
target:
  entity_id: light.pro_bridge_entertainment
data:
  scene: sweep
  params:
    color: "#0050ff"
    bounce: true
  speed: 1.5
```

The quickest way to play a scene with its default settings is the light's effect:

```yaml
action: light.turn_on
target:
  entity_id: light.pro_bridge_entertainment
data:
  effect: Aurora
```

### `ha_hue_entertainment.stop_scene`

Stop the scene. The lights keep its last frame and sync stays on; turn the
Entertainment light off to stop sync.

## Scenes (animations)

> **Further development**: the scenes feature is very basic allowing for some animated scenes already, but is one of the areas I want to focus on most when the base is solid, allowing for even more advanced effects.

There is a couple of built in scenes that are shipped with the integration, these are meant as demo scenes and can change later on: **Sweep** (a band of colour travelling across the room), **Aurora**
(slow green, teal and violet curtains) and **Thunderstorm** (dark clouds with
lightning that strikes somewhere and rolls through the room).

> Some scenes, like Thunderstorm, flash. If anyone is sensitive to flashing light, avoid them.

**Your own scenes** are JSON files in `config/ha_hue_entertainment/scenes/` (the
folder is created on setup). They are read at startup and when you reload the
integration; a scene with the same `id` as a built-in replaces it, and invalid
files are skipped with the reason in the log.

A scene has settings (`parameters`) and `layers` that compute each light's
colour from its position in the room and the time:

```json
{
  "format": 1,
  "id": "music-flow",
  "name": "Music flow",
  "parameters": {
    "color_1": {"type": "color", "default": "#ff2d95"},
    "color_2": {"type": "color", "default": "#7b2cff"},
    "flow": {"type": "number", "default": 0.08, "min": 0.01, "max": 0.5}
  },
  "layers": [
    {"type": "noise", "colors": ["$color_1", "$color_2"], "scale": 1.2, "drift": "$flow"}
  ]
}
```

Layer types: `solid`, `gradient`, `band`, `noise` and `flash`, combined with
`normal`, `add` or `max` blending. The full format is described at the top of
[`core/scenes.py`](custom_components/ha_hue_entertainment/core/scenes.py), and
the [built-in scenes](custom_components/ha_hue_entertainment/scenes) are
examples to start from.

## External clients

Your own programs can claim control and stream colours in real time over Home
Assistant's WebSocket, using a token of a dedicated non-admin user. See
[docs/EXTERNAL_CLIENTS.md](docs/EXTERNAL_CLIENTS.md).

## Automation examples

Flash the light next to the front door red for 5 seconds when the doorbell
rings, on top of whatever is playing:

```yaml
triggers:
  - trigger: state
    entity_id: binary_sensor.doorbell
    to: "on"
actions:
  - action: ha_hue_entertainment.set_colors
    target:
      entity_id: light.pro_bridge_entertainment
    data:
      channels:
        4: [255, 0, 0]
      overlay: true
      duration: 5
```

Start the thunderstorm when a movie starts after sunset:

```yaml
triggers:
  - trigger: state
    entity_id: media_player.living_room_tv
    to: playing
conditions:
  - condition: sun
    after: sunset
actions:
  - action: light.turn_on
    target:
      entity_id: light.pro_bridge_entertainment
    data:
      effect: Thunderstorm
```

## Known limitations

- **One stream per bridge.** While a Hue Sync Box, the Hue Sync app or another app streams, this integration can't (unless **Allow override** is on), and the other way round.
- **Gradient lights** get as many controllable parts as the bridge gives them channels in the entertainment area, which can be fewer than the light's segments.
- **Positions** come from the entertainment area in the Hue app; scenes and the room view are only as accurate as that setup.

## Troubleshooting

- **"Bridge is busy: … is syncing"**: another app (often a Hue Sync Box) holds the bridge. Stop it, or turn on **Allow override**.
- **The bridge isn't found**: make sure Home Assistant and the bridge are on the same network, or enter the bridge's IP address during setup.
- **Sync turns itself off**: another app took over the bridge, or the area was stopped in the Hue app. The panel shows the reason.
- **Debug logging**: on the integration's page, select **Enable debug logging**, reproduce the problem, then disable it to download the log. Or in
  `configuration.yaml`:

  ```yaml
  logger:
    logs:
      custom_components.ha_hue_entertainment: debug
  ```

Report problems on the [issue tracker](https://github.com/Rens-br/ha-hue-entertainment/issues).

## Development

- `custom_components/ha_hue_entertainment/core/`: bridge (discovery, pairing, CLIP v2), stream (HueStream v2 over DTLS with pyOpenSSL), engine, scenes. No Home Assistant imports, so the [standalone server](docs/STANDALONE.md) uses the same code.
- The panel is TypeScript + Lit in `frontend/`, built into `custom_components/ha_hue_entertainment/frontend/panel.js` (committed, so installing needs no build step):

  ```bash
  cd frontend && npm ci
  npm run build    # type-check and build panel.js
  npm run lint     # ESLint + Prettier
  ```

- Python is checked with `ruff check` and `ruff format` (config in `pyproject.toml`). CI runs these, hassfest and the HACS validator.

## License

MIT, see [LICENSE](LICENSE).
