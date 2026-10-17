"""Turn entertainment sync on and off."""
from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import HueEntertainmentConfigEntry
from .core.bridge import BridgeError
from .entity import HueEntertainmentEntity

DEFAULT_FPS = 50


async def async_setup_entry(
    hass: HomeAssistant, entry: HueEntertainmentConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities([SyncSwitch(entry.runtime_data)])


class SyncSwitch(HueEntertainmentEntity, SwitchEntity):
    """On while the integration wants a stream (including while it reconnects)."""

    def __init__(self, engine) -> None:
        super().__init__(engine, "sync")
        self._starting = False

    @property
    def is_on(self) -> bool:
        return self._starting or self.engine.want_fps is not None

    async def async_turn_on(self, **kwargs: Any) -> None:
        # Show "on" while starting, so a failed start is a real on -> off change
        # and the toggle in the UI flips back.
        self._starting = True
        self.async_write_ha_state()
        try:
            await self.engine.start_stream(DEFAULT_FPS)
        except (BridgeError, ValueError) as err:
            self._starting = False
            # The flip back is the integration's doing, not the user's: write it
            # with a fresh context so the logbook doesn't credit the user.
            self.async_set_context(Context())
            self.async_write_ha_state()
            raise HomeAssistantError(str(err)) from err
        self._starting = False
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.engine.stop_stream()
