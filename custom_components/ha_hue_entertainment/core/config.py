"""Settings the engine needs: bridge address, pairing keys and the selected zone.

Where they are stored is up to the caller (a config entry in Home Assistant,
a JSON file for the standalone server); the engine reports changes through a
save callback.
"""
from dataclasses import dataclass


@dataclass
class Settings:
    bridge_host: str | None = None
    bridge_id: str | None = None
    app_key: str | None = None      # "username" from pairing; also the DTLS PSK identity
    client_key: str | None = None   # hex PSK for DTLS streaming
    selected_zone: str | None = None

    @property
    def paired(self) -> bool:
        return bool(self.bridge_host and self.app_key and self.client_key)
