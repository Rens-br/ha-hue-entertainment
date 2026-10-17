"""Select the entertainment zone to stream to."""
from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import HueEntertainmentConfigEntry
from .core.bridge import BridgeError
from .entity import HueEntertainmentEntity


async def async_setup_entry(
    hass: HomeAssistant, entry: HueEntertainmentConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    engine = entry.runtime_data
    async_add_entities([ZoneSelect(engine, await engine.list_zones())])


class ZoneSelect(HueEntertainmentEntity, SelectEntity):
    """Entertainment areas from the Hue app. Switching while syncing moves the stream."""

    def __init__(self, engine, zones: list[dict]) -> None:
        super().__init__(engine, "zone")
        self._ids: dict[str, str] = {}  # option label -> zone id
        for z in zones:
            label = z["name"] if z["name"] not in self._ids else f"{z['name']} ({z['id'][:8]})"
            self._ids[label] = z["id"]
        self._attr_options = list(self._ids)

    @property
    def current_option(self) -> str | None:
        zone = self.engine.zone
        if not zone:
            return None
        return next((label for label, zid in self._ids.items() if zid == zone["id"]), None)

    async def async_select_option(self, option: str) -> None:
        try:
            await self.engine.select_zone(self._ids[option])
        except BridgeError as err:
            raise HomeAssistantError(str(err)) from err
