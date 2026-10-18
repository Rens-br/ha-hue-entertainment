"""Scene speed."""

from __future__ import annotations

from homeassistant.components.number import NumberMode, RestoreNumber
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import HueEntertainmentConfigEntry
from .entity import HueEntertainmentEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HueEntertainmentConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    async_add_entities([SceneSpeed(entry.runtime_data)])


class SceneSpeed(HueEntertainmentEntity, RestoreNumber):
    """Speed multiplier for the playing scene (1 = as designed). Kept across restarts."""

    _attr_native_min_value = 0.1
    _attr_native_max_value = 4.0
    _attr_native_step = 0.1
    _attr_mode = NumberMode.SLIDER
    _attr_native_unit_of_measurement = "×"

    def __init__(self, engine) -> None:
        super().__init__(engine, "scene_speed")

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if (
            last := await self.async_get_last_number_data()
        ) and last.native_value is not None:
            self.engine.speed = last.native_value

    @property
    def native_value(self) -> float:
        return self.engine.speed

    async def async_set_native_value(self, value: float) -> None:
        self.engine.speed = value
        self.async_write_ha_state()
