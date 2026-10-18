"""Config flow: find a Hue bridge and pair with it using the link button."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.components import zeroconf
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_HOST
from homeassistant.helpers.httpx_client import get_async_client
from homeassistant.helpers.selector import (
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
)
from homeassistant.helpers.service_info.zeroconf import ZeroconfServiceInfo
import httpx
import voluptuous as vol

from .const import APP_NAME, CONF_APP_KEY, CONF_BRIDGE_ID, CONF_CLIENT_KEY, DOMAIN
from .core.bridge import BridgeError, HueBridge, LinkButtonNotPressed, discover

_LOGGER = logging.getLogger(__name__)

MANUAL = "manual"


class HueEntertainmentConfigFlow(ConfigFlow, domain=DOMAIN):
    """Add a Hue bridge: pick or enter it, then press its link button."""

    VERSION = 1

    def __init__(self) -> None:
        self._discovered: dict[str, dict] = {}  # host -> bridge info
        self._host: str | None = None
        self._name: str | None = None

    def _bridge(self, host: str) -> HueBridge:
        return HueBridge(host, http=get_async_client(self.hass, verify_ssl=False))

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Show discovered bridges, or go straight to manual entry if there are none."""
        if user_input is not None:
            if user_input[CONF_HOST] == MANUAL:
                return await self.async_step_manual()
            return await self._async_use_host(user_input[CONF_HOST])

        azc = await zeroconf.async_get_async_instance(self.hass)
        configured = {e.unique_id for e in self._async_current_entries()}
        self._discovered = {
            b["host"]: b for b in await discover(azc) if b["id"] not in configured
        }
        if not self._discovered:
            return await self.async_step_manual()

        options = [
            SelectOptionDict(value=host, label=f"{b['name']} ({host})")
            for host, b in self._discovered.items()
        ]
        options.append(
            SelectOptionDict(value=MANUAL, label="Enter IP address manually")
        )
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_HOST): SelectSelector(
                        SelectSelectorConfig(options=options)
                    )
                }
            ),
        )

    async def async_step_zeroconf(
        self, discovery_info: ZeroconfServiceInfo
    ) -> ConfigFlowResult:
        """A bridge announced itself on the network.

        Known bridges get their address updated (this is how IP changes are
        picked up); new ones show up as a "Discovered" card.
        """
        bridge_id = discovery_info.properties.get("bridgeid")
        if not bridge_id:
            return self.async_abort(reason="not_hue_bridge")
        host = str(discovery_info.ip_address)
        await self.async_set_unique_id(bridge_id.upper())
        self._abort_if_unique_id_configured(updates={CONF_HOST: host})

        self._host = host
        self._name = discovery_info.name.split(".")[0]
        self.context["title_placeholders"] = {"name": self._name}
        return await self.async_step_link()

    async def async_step_manual(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Enter the bridge address by hand."""
        errors: dict[str, str] = {}
        if user_input is not None:
            result = await self._async_use_host(user_input[CONF_HOST].strip(), errors)
            if result:
                return result
        return self.async_show_form(
            step_id="manual",
            data_schema=vol.Schema({vol.Required(CONF_HOST): str}),
            errors=errors,
        )

    async def _async_use_host(
        self, host: str, errors: dict[str, str] | None = None
    ) -> ConfigFlowResult | None:
        """Identify the bridge at `host`, refuse duplicates, then ask for the link button."""
        try:
            info = await self._bridge(host).info()
        except (httpx.HTTPError, ValueError, KeyError):
            if errors is None:
                return self.async_abort(reason="cannot_connect")
            errors["base"] = "cannot_connect"
            return None
        await self.async_set_unique_id(info["bridgeid"].upper())
        self._abort_if_unique_id_configured(updates={CONF_HOST: host})
        self._host, self._name = host, info.get("name") or "Hue bridge"
        return await self.async_step_link()

    async def async_step_link(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Wait for the user to press the link button, then pair."""
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                app_key, client_key = await self._bridge(self._host).pair(APP_NAME)
            except LinkButtonNotPressed:
                errors["base"] = "link_button_not_pressed"
            except (BridgeError, httpx.HTTPError) as err:
                _LOGGER.warning("Pairing with %s failed: %s", self._host, err)
                errors["base"] = "cannot_connect"
            else:
                return self.async_create_entry(
                    title=self._name,
                    data={
                        CONF_HOST: self._host,
                        CONF_BRIDGE_ID: self.unique_id,
                        CONF_APP_KEY: app_key,
                        CONF_CLIENT_KEY: client_key,
                    },
                )
        return self.async_show_form(
            step_id="link",
            description_placeholders={"name": self._name, "host": self._host},
            errors=errors,
        )
