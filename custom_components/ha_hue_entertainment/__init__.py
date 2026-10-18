"""Hue Entertainment: stream colours and animations to a Hue entertainment area."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import zeroconf
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.httpx_client import get_async_client

from .const import (
    APP_NAME,
    CONF_ALLOW_OVERRIDE,
    CONF_APP_KEY,
    CONF_BRIDGE_ID,
    CONF_CLIENT_KEY,
    CONF_SELECTED_ZONE,
    DOMAIN,
)
from .core.config import Settings
from .core.engine import HueSyncEngine
from .core.scenes import Scene, load_scene_dir

_LOGGER = logging.getLogger(__name__)

BUILTIN_SCENES = Path(__file__).parent / "scenes"

type HueEntertainmentConfigEntry = ConfigEntry[HueSyncEngine]

PLATFORMS = [Platform.LIGHT, Platform.NUMBER, Platform.SELECT, Platform.SWITCH]


async def async_setup_entry(
    hass: HomeAssistant, entry: HueEntertainmentConfigEntry
) -> bool:
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
            entry,
            data={
                **entry.data,
                CONF_HOST: s.bridge_host,
                CONF_SELECTED_ZONE: s.selected_zone,
            },
        )

    engine = HueSyncEngine(
        settings,
        save,
        http=get_async_client(hass, verify_ssl=False),
        zeroconf=await zeroconf.async_get_async_instance(hass),
        app_name=APP_NAME,
    )
    engine.allow_override = entry.options.get(CONF_ALLOW_OVERRIDE, False)
    engine.set_scenes(
        await hass.async_add_executor_job(
            _load_scenes, Path(hass.config.path(DOMAIN, "scenes"))
        )
    )
    await engine.startup()
    if not engine.bridge_name:
        await engine.shutdown()
        raise ConfigEntryNotReady(
            engine.last_error or f"Bridge at {settings.bridge_host} is not reachable"
        )

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
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


def _load_scenes(user_dir: Path) -> dict[str, Scene]:
    """Built-in scenes plus *.json from /config/ha_hue_entertainment/scenes (same id replaces)."""
    user_dir.mkdir(parents=True, exist_ok=True)  # so users can find where scenes go
    builtin, _ = load_scene_dir(BUILTIN_SCENES, builtin=True)
    user, errors = load_scene_dir(user_dir)
    for err in errors:
        _LOGGER.warning("Scene not loaded: %s", err)
    if user:
        _LOGGER.info("Loaded %d scene(s) from %s", len(user), user_dir)
    return {**builtin, **user}


async def async_unload_entry(
    hass: HomeAssistant, entry: HueEntertainmentConfigEntry
) -> bool:
    """Stop any stream and release the bridge."""
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    await entry.runtime_data.shutdown()
    return True
