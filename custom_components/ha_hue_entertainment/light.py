"""The whole entertainment area as one light: on = sync on, with a colour and brightness.

Scenes are the light's effects. Picking a colour or the "off" effect stops a scene.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.light import (
    ATTR_BRIGHTNESS,
    ATTR_EFFECT,
    ATTR_RGB_COLOR,
    EFFECT_OFF,
    ColorMode,
    LightEntity,
    LightEntityFeature,
)
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import entity_platform
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity
import voluptuous as vol

from . import HueEntertainmentConfigEntry
from .core.bridge import BridgeError
from .core.scenes import SceneError
from .entity import HueEntertainmentEntity

ATTR_CHANNELS = "channels"
ATTR_ALL = "all"
ATTR_BRIGHTNESS_PCT = "brightness_pct"
ATTR_OVERLAY = "overlay"
ATTR_DURATION = "duration"
ATTR_CLEAR_OVERLAY = "clear_overlay"
ATTR_SCENE = "scene"
ATTR_PARAMS = "params"
ATTR_SPEED = "speed"

COLOR = vol.Any(cv.string, [vol.Coerce(float)])
SET_COLORS_SCHEMA = {
    vol.Optional(ATTR_CHANNELS): {vol.Coerce(int): COLOR},
    vol.Optional(ATTR_ALL): COLOR,
    vol.Optional(ATTR_BRIGHTNESS_PCT): vol.All(
        vol.Coerce(float), vol.Range(min=0, max=100)
    ),
    vol.Optional(ATTR_OVERLAY, default=False): cv.boolean,
    vol.Optional(ATTR_DURATION): vol.All(vol.Coerce(float), vol.Range(min=0.1)),
    vol.Optional(ATTR_CLEAR_OVERLAY, default=False): cv.boolean,
}
PLAY_SCENE_SCHEMA = {
    vol.Required(ATTR_SCENE): cv.string,
    vol.Optional(ATTR_PARAMS): dict,
    vol.Optional(ATTR_SPEED): vol.All(vol.Coerce(float), vol.Range(min=0.1, max=4)),
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HueEntertainmentConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([EntertainmentLight(entry.runtime_data)])
    platform = entity_platform.async_get_current_platform()
    platform.async_register_entity_service(
        "set_colors", SET_COLORS_SCHEMA, "async_set_colors"
    )
    platform.async_register_entity_service(
        "play_scene", PLAY_SCENE_SCHEMA, "async_play_scene"
    )
    platform.async_register_entity_service("stop_scene", None, "async_stop_scene")


class EntertainmentLight(HueEntertainmentEntity, LightEntity, RestoreEntity):
    """Turning it on starts sync and shows the colour or scene; off stops sync, so
    the lights return to normal. The last colour and brightness are kept across restarts."""

    _attr_color_mode = ColorMode.RGB
    _attr_supported_color_modes = {ColorMode.RGB}
    _attr_supported_features = LightEntityFeature.EFFECT

    def __init__(self, engine) -> None:
        super().__init__(engine, "entertainment")

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) and (
            rgb := last.attributes.get(ATTR_RGB_COLOR)
        ):
            bri = last.attributes.get(ATTR_BRIGHTNESS)
            self.engine.set_colors(all=list(rgb), brightness=bri / 255 if bri else None)

    # ---- state -----------------------------------------------------------

    def _effect_names(self) -> dict[str, str]:
        """Effect label -> scene id. Labels are scene names, made unique if needed."""
        names: dict[str, str] = {}
        for scene in sorted(self.engine.scenes.values(), key=lambda s: s.name.lower()):
            label = (
                scene.name if scene.name not in names else f"{scene.name} ({scene.id})"
            )
            names[label] = scene.id
        return names

    @property
    def is_on(self) -> bool:
        return self.syncing

    @property
    def effect_list(self) -> list[str]:
        return [EFFECT_OFF, *self._effect_names()]

    @property
    def effect(self) -> str:
        sid = self.engine.scene_id
        return next(
            (label for label, i in self._effect_names().items() if i == sid), EFFECT_OFF
        )

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """The zone's channels (ids for set_colors) and the scene playing."""
        zone = self.engine.zone
        if not zone:
            return {}
        return {
            ATTR_CHANNELS: {
                ch["id"]: ", ".join(ch["lights"]) for ch in zone["channels"]
            },
            ATTR_SCENE: self.engine.scene_id,
        }

    @property
    def rgb_color(self) -> tuple[int, int, int]:
        return tuple(round(v * 255) for v in self.engine.base_color)

    @property
    def brightness(self) -> int:
        return round(self.engine.brightness * 255)

    # ---- control -----------------------------------------------------------

    async def async_turn_on(self, **kwargs: Any) -> None:
        rgb = kwargs.get(ATTR_RGB_COLOR)
        bri = kwargs.get(ATTR_BRIGHTNESS)
        effect = kwargs.get(ATTR_EFFECT)
        # A colour replaces a running scene; brightness alone keeps it playing.
        if rgb is not None or bri is not None:
            self.engine.set_colors(
                all=list(rgb) if rgb is not None else None,
                brightness=bri / 255 if bri is not None else None,
            )
        if effect == EFFECT_OFF:
            await self.engine.stop_scene()
        elif effect is not None:
            scene_id = self._effect_names().get(effect)
            if scene_id is None:
                raise ServiceValidationError(f"Unknown effect {effect!r}")
            await self._play(scene_id)
        await self.async_start_sync()
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.engine.stop_stream()

    async def _play(self, scene_id: str, params: dict | None = None) -> None:
        try:
            await self.engine.play_scene(scene_id, params)
        except (BridgeError, SceneError, ValueError) as err:
            raise ServiceValidationError(str(err)) from err

    async def async_set_colors(
        self,
        channels: dict | None = None,
        all=None,
        brightness_pct: float | None = None,
        overlay: bool = False,
        duration: float | None = None,
        clear_overlay: bool = False,
    ) -> None:
        """Set colours per channel and/or for the whole area; starts sync if it is off.
        Without overlay they replace a running scene; with overlay they are drawn on top."""
        if (
            channels is None
            and all is None
            and brightness_pct is None
            and not clear_overlay
        ):
            raise ServiceValidationError(
                "Give channels, all, brightness_pct or clear_overlay"
            )
        try:
            self.engine.set_colors(
                channels={str(ch): c for ch, c in (channels or {}).items()},
                all=all,
                brightness=brightness_pct / 100 if brightness_pct is not None else None,
                overlay=overlay,
                duration=duration,
                clear_overlay=clear_overlay,
            )
        except (BridgeError, ValueError) as err:
            raise ServiceValidationError(str(err)) from err
        await self.async_start_sync()
        self.async_write_ha_state()

    async def async_play_scene(
        self, scene: str, params: dict | None = None, speed: float | None = None
    ) -> None:
        """Play a scene by id or name, with optional parameters; starts sync if it is off."""
        scene_id = (
            scene if scene in self.engine.scenes else self._effect_names().get(scene)
        )
        if scene_id is None:
            raise ServiceValidationError(
                f"Unknown scene {scene!r}; available: {', '.join(self.engine.scenes)}"
            )
        if speed is not None:
            self.engine.speed = speed
        await self._play(scene_id, params)
        await self.async_start_sync()
        self.async_write_ha_state()

    async def async_stop_scene(self) -> None:
        """Stop the scene; the lights keep its last frame and sync stays on."""
        await self.engine.stop_scene()
        self.async_write_ha_state()
