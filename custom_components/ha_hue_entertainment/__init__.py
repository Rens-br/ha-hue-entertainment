"""Hue Entertainment: stream colours and animations to a Hue entertainment area."""
from __future__ import annotations

from homeassistant.components import zeroconf
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.httpx_client import get_async_client

from .const import APP_NAME, CONF_APP_KEY, CONF_BRIDGE_ID, CONF_CLIENT_KEY, CONF_SELECTED_ZONE, DOMAIN
from .core.config import Settings
from .core.engine import HueSyncEngine

type HueEntertainmentConfigEntry = ConfigEntry[HueSyncEngine]


async def async_setup_entry(hass: HomeAssistant, entry: HueEntertainmentConfigEntry) -> bool:
    """Connect to the bridge and load the selected entertainment zone."""
    settings = Settings(
        bridge_host=entry.data[CONF_HOST],
        bridge_id=entry.data[CONF_BRIDGE_ID],
        app_key=entry.data[CONF_APP_KEY],
        client_key=entry.data[CONF_CLIENT_KEY],
        selected_zone=entry.data.get(CONF_SELECTED_ZONE),
    )

    def save(s: Settings) -> None:
        # The engine updates these when the bridge moves or another zone is selected.
        hass.config_entries.async_update_entry(
            entry, data={**entry.data, CONF_HOST: s.bridge_host, CONF_SELECTED_ZONE: s.selected_zone}
        )

    engine = HueSyncEngine(
        settings,
        save,
        http=get_async_client(hass, verify_ssl=False),
        zeroconf=await zeroconf.async_get_async_instance(hass),
        app_name=APP_NAME,
    )
    await engine.startup()
    if not engine.bridge_name:
        await engine.shutdown()
        raise ConfigEntryNotReady(engine.last_error or f"Bridge at {settings.bridge_host} is not reachable")

    info = engine.bridge_info
    dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, settings.bridge_id)},
        manufacturer="Signify",
        model=info.get("modelid"),
        name=engine.bridge_name,
        sw_version=info.get("swversion"),
        configuration_url=f"https://{settings.bridge_host}",
    )

    entry.runtime_data = engine
    return True


async def async_unload_entry(hass: HomeAssistant, entry: HueEntertainmentConfigEntry) -> bool:
    """Stop any stream and release the bridge."""
    await entry.runtime_data.shutdown()
    return True
