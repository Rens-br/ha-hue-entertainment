"""Animated scenes: JSON definitions rendered per channel from position and time.

A scene is a list of layers drawn in order. Every layer computes, for each
channel, a colour and a strength (0..1) from the channel's position
(x, y, z in -1..1, as set in the Hue app) and the scene time, then blends onto
what is below it. Scenes are data, not code, so a shared scene can't run anything.

Format version 1:

    {
      "format": 1,
      "id": "sweep",                       # [a-z0-9_-]
      "name": "Sweep",
      "description": "...", "author": "...",          # optional
      "parameters": {                                  # optional
        "color": {"type": "color", "default": "#ff7a00"},
        "width": {"type": "number", "default": 0.4, "min": 0.1, "max": 2},
        "axis":  {"type": "choice", "default": "x", "options": ["x", "y", "z"]}
      },
      "duration": 10,                      # optional: play once for N seconds; omitted = loop
      "layers": [
        {"type": "solid", "color": "#000000"},
        {"type": "band", "axis": "$axis", "color": "$color", "width": "$width", "period": 4}
      ]
    }

Any layer value may be "$name" to use a parameter. Colours take the same forms
as set_colors: [r, g, b], [r, g, b, brightness] (0-255), "#rrggbb", "#rrggbbBB".

Layer types (all accept "blend": "normal" | "add" | "max", "opacity": 0..1):
- solid:    color
- gradient: axis (x|y|z|angle|radius), colors [..], shift (units/s, moves the pattern)
- band:     axis, color, width, period (s per pass), bounce (bool), from, to
- noise:    colors [..] (palette), scale (spatial), drift (speed)
- flash:    color, rate (strikes/s), spread (units/s, 0 = everywhere at once),
            decay (s), flicker (pulses per strike)
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import logging
import math
from pathlib import Path
import random
import re

log = logging.getLogger(__name__)

FORMAT_VERSION = 1
ID_RE = re.compile(r"^[a-z0-9_-]{1,64}$")
AXES = ("x", "y", "z", "angle", "radius")
BLENDS = ("normal", "add", "max")

Color = tuple[float, float, float]
Position = tuple[float, float, float]


class SceneError(ValueError):
    """A scene file is invalid. The message says where."""


def parse_color(value) -> Color:
    """[r, g, b] / [r, g, b, brightness] in 0..255, or "#rrggbb" / "#rrggbbBB" -> floats 0..1."""
    if isinstance(value, str):
        h = value.lstrip("#")
        if len(h) not in (6, 8):
            raise ValueError(f"bad hex colour {value!r}")
        try:
            value = [int(h[i : i + 2], 16) for i in range(0, len(h), 2)]
        except ValueError:
            raise ValueError(f"bad hex colour {value!r}") from None
    if isinstance(value, (list, tuple)) and len(value) in (3, 4):
        v = [max(0.0, min(255.0, float(x))) / 255 for x in value]
        scale = v[3] if len(v) == 4 else 1.0
        return tuple(c * scale for c in v[:3])
    raise ValueError(
        f"bad colour {value!r}; use [r,g,b], [r,g,b,brightness] (0-255), '#rrggbb' or '#rrggbbBB'"
    )


# ---- definition ----------------------------------------------------------


@dataclass
class Scene:
    id: str
    name: str
    raw: dict  # the validated JSON, for export
    parameters: dict[str, dict] = field(default_factory=dict)
    duration: float | None = None
    description: str = ""
    author: str = ""
    builtin: bool = False

    def defaults(self) -> dict:
        return {name: p["default"] for name, p in self.parameters.items()}


def load_scene(data: dict, source: str = "scene", builtin: bool = False) -> Scene:
    """Validate a scene definition and return it. Raises SceneError."""

    def fail(msg):
        raise SceneError(f"{source}: {msg}")

    if not isinstance(data, dict):
        fail("must be a JSON object")
    if data.get("format") != FORMAT_VERSION:
        fail(f'"format" must be {FORMAT_VERSION}')
    sid, name = data.get("id"), data.get("name")
    if not isinstance(sid, str) or not ID_RE.match(sid):
        fail('"id" must be 1-64 characters of a-z, 0-9, _ or -')
    if not isinstance(name, str) or not name.strip():
        fail('"name" is required')

    params = data.get("parameters", {})
    if not isinstance(params, dict):
        fail('"parameters" must be an object')
    for pname, p in params.items():
        _check_parameter(pname, p, fail)

    duration = data.get("duration")
    if duration is not None and (
        not isinstance(duration, (int, float)) or duration <= 0
    ):
        fail('"duration" must be a positive number of seconds')

    layers = data.get("layers")
    if not isinstance(layers, list) or not layers:
        fail('"layers" must be a non-empty list')
    for i, layer in enumerate(layers):
        try:
            _build_layer(
                layer,
                params,
                params_values={n: p["default"] for n, p in params.items()},
            )
        except (SceneError, ValueError, TypeError, KeyError) as e:
            fail(f"layer {i + 1}: {e}")

    return Scene(
        id=sid,
        name=name.strip(),
        raw=data,
        parameters=params,
        duration=duration,
        description=data.get("description", ""),
        author=data.get("author", ""),
        builtin=builtin,
    )


def _check_parameter(name: str, p, fail):
    if not isinstance(p, dict) or p.get("type") not in ("color", "number", "choice"):
        fail(f'parameter "{name}" needs "type": color, number or choice')
    if "default" not in p:
        fail(f'parameter "{name}" needs a "default"')
    if p["type"] == "choice":
        if p["default"] not in p.get("options", []):
            fail(f'parameter "{name}": default must be one of "options"')
        return
    try:
        parse_color(p["default"]) if p["type"] == "color" else float(p["default"])
    except (ValueError, TypeError) as e:
        fail(f'parameter "{name}": {e}')


def load_scene_dir(
    path: Path, builtin: bool = False
) -> tuple[dict[str, Scene], list[str]]:
    """Load every *.json in `path`. Returns (scenes by id, error messages). Never raises."""
    scenes, errors = {}, []
    if not path.is_dir():
        return scenes, errors
    for file in sorted(path.glob("*.json")):
        try:
            scene = load_scene(
                json.loads(file.read_text()), source=file.name, builtin=builtin
            )
        except (OSError, json.JSONDecodeError) as e:
            errors.append(f"{file.name}: {e}")
            continue
        except SceneError as e:
            errors.append(str(e))
            continue
        if scene.id in scenes:
            errors.append(f"{file.name}: duplicate id {scene.id!r}, ignored")
            continue
        scenes[scene.id] = scene
    return scenes, errors


# ---- layers --------------------------------------------------------------


def _resolve(value, params_values: dict):
    if isinstance(value, str) and value.startswith("$"):
        name = value[1:]
        if name not in params_values:
            raise SceneError(f'unknown parameter "${name}"')
        return params_values[name]
    return value


def _axis_value(pos: Position, axis: str) -> float:
    x, y, z = pos
    if axis == "x":
        return x
    if axis == "y":
        return y
    if axis == "z":
        return z
    if axis == "angle":  # 0..1 around the room's centre, seen from above
        return (math.atan2(y, x) / (2 * math.pi)) % 1.0
    return min(1.0, math.hypot(x, y))  # radius, 0 (centre) .. 1


def _palette(colors: list[Color], t: float) -> Color:
    """Smoothly pick from a palette at t in 0..1 (wraps)."""
    t = (t % 1.0) * len(colors)
    i = int(t)
    a, b, f = colors[i % len(colors)], colors[(i + 1) % len(colors)], t - i
    return tuple(a[k] + (b[k] - a[k]) * f for k in range(3))


class Layer:
    def __init__(self, spec: dict, params_values: dict):
        self.blend = spec.get("blend", "normal")
        if self.blend not in BLENDS:
            raise SceneError(f'"blend" must be one of {", ".join(BLENDS)}')
        self.opacity = float(_resolve(spec.get("opacity", 1.0), params_values))
        if not 0 <= self.opacity <= 1:
            raise SceneError('"opacity" must be between 0 and 1')

    def reset(self, positions: dict[int, Position], rng: random.Random) -> None:
        """Called when the scene (re)starts on a zone."""

    def sample(self, ch: int, pos: Position, t: float) -> tuple[Color, float]:
        raise NotImplementedError


class Solid(Layer):
    def __init__(self, spec, pv):
        super().__init__(spec, pv)
        self.color = parse_color(_resolve(spec["color"], pv))

    def sample(self, ch, pos, t):
        return self.color, 1.0


class Gradient(Layer):
    def __init__(self, spec, pv):
        super().__init__(spec, pv)
        self.axis = _resolve(spec.get("axis", "x"), pv)
        if self.axis not in AXES:
            raise SceneError(f'"axis" must be one of {", ".join(AXES)}')
        self.colors = [parse_color(_resolve(c, pv)) for c in spec["colors"]]
        if len(self.colors) < 2:
            raise SceneError('"colors" needs at least 2 colours')
        self.shift = float(_resolve(spec.get("shift", 0), pv))

    def sample(self, ch, pos, t):
        v = _axis_value(pos, self.axis)
        if self.axis not in ("angle", "radius"):
            v = (v + 1) / 2  # -1..1 -> 0..1
        return _palette(self.colors, v + self.shift * t), 1.0


class Band(Layer):
    """A soft band travelling along an axis: the sweep."""

    def __init__(self, spec, pv):
        super().__init__(spec, pv)
        self.axis = _resolve(spec.get("axis", "x"), pv)
        if self.axis not in ("x", "y", "z"):
            raise SceneError('"axis" must be x, y or z')
        self.color = parse_color(_resolve(spec["color"], pv))
        self.width = float(_resolve(spec.get("width", 0.4), pv))
        self.period = float(_resolve(spec.get("period", 4), pv))
        self.bounce = bool(_resolve(spec.get("bounce", False), pv))
        self.start = float(_resolve(spec.get("from", -1.2), pv))
        self.end = float(_resolve(spec.get("to", 1.2), pv))
        if self.width <= 0 or self.period <= 0:
            raise SceneError('"width" and "period" must be positive')

    def sample(self, ch, pos, t):
        phase = (t / self.period) % (2.0 if self.bounce else 1.0)
        if phase > 1.0:
            phase = 2.0 - phase
        centre = self.start + (self.end - self.start) * phase
        d = abs(_axis_value(pos, self.axis) - centre) / self.width
        strength = max(0.0, 1.0 - d) ** 2 * (
            3 - 2 * max(0.0, 1.0 - d)
        )  # smoothstep falloff
        return self.color, strength


class Noise(Layer):
    """Smooth moving colour field (sum of drifting waves), for aurora, water, lava."""

    def __init__(self, spec, pv):
        super().__init__(spec, pv)
        self.colors = [parse_color(_resolve(c, pv)) for c in spec["colors"]]
        if len(self.colors) < 2:
            raise SceneError('"colors" needs at least 2 colours')
        self.scale = float(_resolve(spec.get("scale", 1.5), pv))
        self.drift = float(_resolve(spec.get("drift", 0.1), pv))

    def sample(self, ch, pos, t):
        x, y, z = (c * self.scale for c in pos)
        d = self.drift * t * 2 * math.pi
        v = (
            math.sin(x * 1.7 + d)
            + math.sin(y * 2.3 - d * 0.7 + 1.3)
            + math.sin((x + y + z) * 1.1 + d * 0.45 + 2.1)
        ) / 6 + 0.5  # 0..1
        return _palette(self.colors, v), 1.0


class Flash(Layer):
    """Random strikes from a point that roll across the room: lightning, fireworks."""

    def __init__(self, spec, pv):
        super().__init__(spec, pv)
        self.color = parse_color(_resolve(spec["color"], pv))
        self.rate = float(_resolve(spec.get("rate", 0.1), pv))
        self.spread = float(_resolve(spec.get("spread", 2.0), pv))
        self.decay = float(_resolve(spec.get("decay", 0.4), pv))
        self.flicker = int(_resolve(spec.get("flicker", 2), pv))
        if self.rate < 0 or self.decay <= 0 or self.flicker < 1:
            raise SceneError('"rate" >= 0, "decay" > 0 and "flicker" >= 1 required')
        self._strikes: list[tuple[float, Position]] = []
        self._next = 0.0
        self._at = -1.0  # time the strike list was last advanced to
        self._rng = random.Random()

    def reset(self, positions, rng):
        self._rng, self._strikes = rng, []
        self._next = self._rng.expovariate(self.rate) if self.rate else math.inf

    def _advance(self, t):
        while t >= self._next:
            origin = (
                self._rng.uniform(-1, 1),
                self._rng.uniform(-1, 1),
                self._rng.uniform(-0.5, 1),
            )
            self._strikes.append((self._next, origin))
            self._next += self._rng.expovariate(self.rate)
        lifetime = self.decay * self.flicker + 3 / max(self.spread, 0.1)
        self._strikes = [s for s in self._strikes if t - s[0] < lifetime]

    def sample(self, ch, pos, t):
        if t != self._at:  # once per frame, not per channel
            self._advance(t)
            self._at = t
        strength = 0.0
        for start, origin in self._strikes:
            delay = math.dist(pos, origin) / self.spread if self.spread > 0 else 0.0
            local = t - start - delay
            if local < 0:
                continue
            pulse, phase = divmod(local, self.decay)
            if pulse >= self.flicker:
                continue
            strength = max(strength, (1 - phase / self.decay) ** 2 * (0.6**pulse))
        return self.color, strength


LAYER_TYPES = {
    "solid": Solid,
    "gradient": Gradient,
    "band": Band,
    "noise": Noise,
    "flash": Flash,
}


def _build_layer(spec: dict, params: dict, params_values: dict) -> Layer:
    if not isinstance(spec, dict) or spec.get("type") not in LAYER_TYPES:
        raise SceneError(f'"type" must be one of {", ".join(LAYER_TYPES)}')
    return LAYER_TYPES[spec["type"]](spec, params_values)


def _blend(base: Color, color: Color, strength: float, mode: str) -> Color:
    if mode == "add":
        return tuple(
            min(1.0, b + c * strength) for b, c in zip(base, color, strict=True)
        )
    if mode == "max":
        return tuple(max(b, c * strength) for b, c in zip(base, color, strict=True))
    return tuple(b + (c - b) * strength for b, c in zip(base, color, strict=True))


# ---- running ---------------------------------------------------------------


class SceneRun:
    """A scene playing on a set of channel positions. render(dt) is called by the
    stream thread for every frame; it returns None once a play-once scene ends."""

    def __init__(
        self,
        scene: Scene,
        positions: dict[int, Position],
        params: dict | None = None,
        seed: int | None = None,
    ):
        values = scene.defaults()
        for name, value in (params or {}).items():
            if name not in scene.parameters:
                raise SceneError(f'{scene.id}: unknown parameter "{name}"')
            values[name] = value
        self.scene, self.params = scene, values
        self.layers = [
            _build_layer(spec, scene.parameters, values) for spec in scene.raw["layers"]
        ]
        self.positions = positions
        self.time = 0.0
        rng = random.Random(seed)
        for layer in self.layers:
            layer.reset(positions, rng)

    def render(self, dt: float, speed: float = 1.0) -> dict[int, Color] | None:
        self.time += dt * speed
        if self.scene.duration is not None and self.time > self.scene.duration:
            return None
        frame = {}
        for ch, pos in self.positions.items():
            c: Color = (0.0, 0.0, 0.0)
            for layer in self.layers:
                color, strength = layer.sample(ch, pos, self.time)
                c = _blend(c, color, strength * layer.opacity, layer.blend)
            frame[ch] = c
        return frame
