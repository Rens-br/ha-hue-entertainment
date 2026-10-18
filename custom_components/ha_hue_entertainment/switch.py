"""Configuration switch: may starting sync stop another app's stream?"""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import HueEntertainmentConfigEntry, async_set_allow_override
from .entity import HueEntertainmentEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HueEntertainmentConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([AllowOverrideSwitch(entry)])


class AllowOverrideSwitch(HueEntertainmentEntity, SwitchEntity):
    """Off: a busy bridge (e.g. Hue Sync Box syncing) makes starting fail.
    On: starting stops the other app's stream first. Automatic reconnects never do."""

    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, entry: HueEntertainmentConfigEntry) -> None:
        super().__init__(entry.runtime_data, "allow_override")
        self._entry = entry

    @property
    def is_on(self) -> bool:
        return self.engine.allow_override

    async def async_turn_on(self, **kwargs: Any) -> None:
        await async_set_allow_override(self.hass, self._entry, True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await async_set_allow_override(self.hass, self._entry, False)
