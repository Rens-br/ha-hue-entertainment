"""JSON file storage for the standalone server's settings."""

from dataclasses import asdict
import json
import os
from pathlib import Path

from core.config import Settings


class ConfigStore:
    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.settings = self._load()

    def _load(self) -> Settings:
        try:
            data = json.loads(self.path.read_text())
            return Settings(
                **{k: v for k, v in data.items() if k in Settings.__dataclass_fields__}
            )
        except (FileNotFoundError, json.JSONDecodeError):
            return Settings()

    def save(self, settings: Settings | None = None) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(asdict(settings or self.settings), indent=2))
        os.chmod(tmp, 0o600)  # holds the bridge keys
        tmp.replace(self.path)
