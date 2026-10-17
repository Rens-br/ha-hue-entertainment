"""Base entity: belongs to the bridge device and follows engine status changes."""
from __future__ import annotations

from homeassistant.core import Context
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity

from .const import DOMAIN
from .core.bridge import BridgeError
from .core.engine import HueSyncEngine

DEFAULT_FPS = 50


class HueEntertainmentEntity(Entity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, engine: HueSyncEngine, key: str) -> None:
        self.engine = engine
        bridge_id = engine.settings.bridge_id
        self._attr_unique_id = f"{bridge_id}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, bridge_id)})
        self._starting = False

    @property
    def syncing(self) -> bool:
        """On while sync is wanted, or while this entity is starting it."""
        return self._starting or self.engine.want_fps is not None

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.engine.add_listener(self.async_write_ha_state))

    async def async_start_sync(self) -> None:
        """Start the stream if needed. Shows "on" while starting, so a failed
        start is a real on -> off change and toggles in the UI flip back."""
        if self.engine.want_fps is not None:
            return
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
