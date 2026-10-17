"""The whole entertainment area as one light: on = sync on, with a colour and brightness."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components.light import ATTR_BRIGHTNESS, ATTR_RGB_COLOR, ColorMode, LightEntity
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv, entity_platform
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from . import HueEntertainmentConfigEntry
from .core.bridge import BridgeError
from .entity import HueEntertainmentEntity

SERVICE_SET_COLORS = "set_colors"
ATTR_CHANNELS = "channels"
ATTR_ALL = "all"
ATTR_BRIGHTNESS_PCT = "brightness_pct"

COLOR = vol.Any(cv.string, [vol.Coerce(float)])
SET_COLORS_SCHEMA = {
    vol.Optional(ATTR_CHANNELS): {vol.Coerce(int): COLOR},
    vol.Optional(ATTR_ALL): COLOR,
    vol.Optional(ATTR_BRIGHTNESS_PCT): vol.All(vol.Coerce(float), vol.Range(min=0, max=100)),
}


async def async_setup_entry(
    hass: HomeAssistant, entry: HueEntertainmentConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities([EntertainmentLight(entry.runtime_data)])
    entity_platform.async_get_current_platform().async_register_entity_service(
        SERVICE_SET_COLORS, SET_COLORS_SCHEMA, "async_set_colors"
    )


class EntertainmentLight(HueEntertainmentEntity, LightEntity, RestoreEntity):
    """Turning it on starts sync and shows the colour; off stops sync, so the lights
    return to normal. The last colour and brightness are kept across restarts."""

    _attr_color_mode = ColorMode.RGB
    _attr_supported_color_modes = {ColorMode.RGB}

    def __init__(self, engine) -> None:
        super().__init__(engine, "entertainment")

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) and (rgb := last.attributes.get(ATTR_RGB_COLOR)):
            bri = last.attributes.get(ATTR_BRIGHTNESS)
            self.engine.set_colors(all=list(rgb), brightness=bri / 255 if bri else None)

    @property
    def is_on(self) -> bool:
        return self.syncing

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """The zone's channels, so users know which id to use in set_colors."""
        zone = self.engine.zone
        if not zone:
            return {}
        return {ATTR_CHANNELS: {ch["id"]: ", ".join(ch["lights"]) for ch in zone["channels"]}}

    @property
    def rgb_color(self) -> tuple[int, int, int]:
        return tuple(round(v * 255) for v in self.engine.base_color)

    @property
    def brightness(self) -> int:
        return round(self.engine.brightness * 255)

    async def async_turn_on(self, **kwargs: Any) -> None:
        rgb = kwargs.get(ATTR_RGB_COLOR)
        bri = kwargs.get(ATTR_BRIGHTNESS)
        if rgb is not None or bri is not None:
            self.engine.set_colors(all=list(rgb) if rgb is not None else None,
                                   brightness=bri / 255 if bri is not None else None)
        await self.async_start_sync()
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.engine.stop_stream()

    async def async_set_colors(
        self, channels: dict | None = None, all=None, brightness_pct: float | None = None
    ) -> None:
        """Set colours per channel and/or for the whole area; starts sync if it is off."""
        if channels is None and all is None and brightness_pct is None:
            raise ServiceValidationError("Give channels, all or brightness_pct")
        try:
            self.engine.set_colors(
                channels={str(ch): c for ch, c in (channels or {}).items()},
                all=all,
                brightness=brightness_pct / 100 if brightness_pct is not None else None,
            )
        except (BridgeError, ValueError) as err:
            raise ServiceValidationError(str(err)) from err
        await self.async_start_sync()
        self.async_write_ha_state()
