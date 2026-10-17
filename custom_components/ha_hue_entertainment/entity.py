"""Base entity: belongs to the bridge device and follows engine status changes."""
from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity

from .const import DOMAIN
from .core.engine import HueSyncEngine


class HueEntertainmentEntity(Entity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, engine: HueSyncEngine, key: str) -> None:
        self.engine = engine
        bridge_id = engine.settings.bridge_id
        self._attr_unique_id = f"{bridge_id}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, bridge_id)})

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.engine.add_listener(self.async_write_ha_state))
