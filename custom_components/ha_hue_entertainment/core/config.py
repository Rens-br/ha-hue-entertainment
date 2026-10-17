"""Persisted settings: bridge address, pairing keys and the selected zone.

The caller decides where the file lives (the standalone server uses data/config.json).
"""
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path


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


class ConfigStore:
    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.settings = self._load()

    def _load(self) -> Settings:
        try:
            data = json.loads(self.path.read_text())
            return Settings(**{k: v for k, v in data.items() if k in Settings.__dataclass_fields__})
        except (FileNotFoundError, json.JSONDecodeError):
            return Settings()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(asdict(self.settings), indent=2))
        os.chmod(tmp, 0o600)  # holds the bridge keys
        tmp.replace(self.path)
