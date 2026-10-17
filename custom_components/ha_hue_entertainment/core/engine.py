"""Core state: pairing, zone selection, streaming lifecycle and the colour buffer.

The HTTP/WebSocket server is a thin layer over this class.

Streaming is desired-state: once a stream has started, a watchdog keeps it
alive. If the bridge reboots, changes IP, or another app takes the stream,
it reconnects with backoff until `stop_stream()` is called.
"""
import asyncio
import inspect
import logging
import time
from collections.abc import Callable

import httpx

from .bridge import BridgeError, HueBridge, LinkButtonNotPressed, discover
from .config import Settings
from .stream import DtlsStreamer, Frame

log = logging.getLogger(__name__)

Color = tuple[float, float, float]

WATCHDOG_INTERVAL = 2.0     # how often the watchdog looks at the stream
BRIDGE_CHECK_INTERVAL = 10  # how often it asks the bridge if our stream is still active
ACTIVATE_TIMEOUT = 3.0      # time for the bridge to mark the zone active after "start"
MAX_BACKOFF = 30.0


def parse_color(value) -> Color:
    """Accept [r, g, b] in 0..255 or '#rrggbb'. Returns floats in 0..1."""
    if isinstance(value, str):
        h = value.lstrip("#")
        if len(h) != 6:
            raise ValueError(f"bad hex colour {value!r}")
        return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    if isinstance(value, (list, tuple)) and len(value) == 3:
        return tuple(max(0.0, min(255.0, float(v))) / 255 for v in value)
    raise ValueError(f"bad colour {value!r}; use [r,g,b] 0-255 or '#rrggbb'")


def to_hex(c: Color) -> str:
    return "#" + "".join(f"{round(v * 255):02x}" for v in c)


class HueSyncEngine:
    def __init__(self, settings: Settings, save: Callable[[Settings], object],
                 http: httpx.AsyncClient | None = None, zeroconf=None, app_name: str = "ha_hue_entertainment#core"):
        """`save(settings)` persists changes (may be async). `http` and `zeroconf` let
        the host share its clients; otherwise the core creates its own."""
        self.settings = settings
        self._save_cb = save
        self._http = http
        self._zeroconf = zeroconf
        self._app_name = app_name
        self.bridge: HueBridge | None = None
        self.bridge_name: str | None = None
        self.zone: dict | None = None
        self.streamer: DtlsStreamer | None = None
        self.frame: Frame = {}
        self.brightness = 1.0
        self.frame_version = 0          # bumps on every colour change
        self.command_rate = 0.0
        self._cmd_count = 0
        self._cmd_window = time.monotonic()

        self.want_fps: float | None = None  # set while the user wants a stream
        self.stream_state = "off"           # off | streaming | reconnecting
        self.last_error: str | None = None
        self._retry_at = 0.0
        self._backoff = WATCHDOG_INTERVAL
        self._last_bridge_check = 0.0

        self._lock = asyncio.Lock()
        self._watchdog: asyncio.Task | None = None
        self.on_status_change = None    # async callback set by the server

    # ---- lifecycle -------------------------------------------------------

    async def startup(self):
        s = self.settings
        if s.paired:
            self.bridge = HueBridge(s.bridge_host, s.app_key, self._http)
            await self._connect_bridge()
        self._watchdog = asyncio.create_task(self._watch())

    async def shutdown(self):
        if self._watchdog:
            self._watchdog.cancel()
        if self.want_fps or self.streamer:
            await self.stop_stream()
        if self.bridge:
            await self.bridge.close()

    async def _connect_bridge(self) -> bool:
        """Load bridge name and saved zone. Safe to call repeatedly."""
        try:
            info = await self._call(lambda b: b.info())
            self.bridge_name = info.get("name")
            sel = self.settings.selected_zone
            if sel and not self.zone:
                await self._load_zone(sel)
            return True
        except Exception as e:
            self.last_error = f"bridge not reachable: {e}"
            log.warning(self.last_error)
            return False

    # ---- bridge / pairing ------------------------------------------------

    async def discover(self) -> list[dict]:
        return await discover(self._zeroconf)

    async def pair(self, host: str) -> dict:
        async with self._lock:
            if self.want_fps:
                raise BridgeError("Stop streaming before pairing")
            bridge = HueBridge(host, http=self._http)
            info = await bridge.info()
            app_key, client_key = await bridge.pair(self._app_name)
            s = self.settings
            s.bridge_host, s.bridge_id = host, info.get("bridgeid")
            s.app_key, s.client_key, s.selected_zone = app_key, client_key, None
            await self._save()
            if self.bridge:
                await self.bridge.close()
            bridge.app_key = app_key
            self.bridge, self.bridge_name, self.zone = bridge, info.get("name"), None
        await self._notify()
        return {"bridge_id": s.bridge_id, "name": self.bridge_name}

    async def forget(self):
        await self.stop_stream()
        s = self.settings
        s.bridge_host = s.bridge_id = s.app_key = s.client_key = s.selected_zone = None
        await self._save()
        if self.bridge:
            await self.bridge.close()
        self.bridge = self.bridge_name = self.zone = None
        await self._notify()

    async def _call(self, fn):
        """Run fn(bridge). If the bridge is unreachable, look it up again by ID and retry once."""
        if not self.bridge:
            raise BridgeError("Not paired with a bridge")
        try:
            return await fn(self.bridge)
        except httpx.TransportError:
            if await self._relocate_bridge():
                return await fn(self.bridge)
            raise BridgeError(f"Bridge at {self.bridge.host} is not reachable")

    async def _relocate_bridge(self) -> bool:
        """Find the paired bridge by its ID via mDNS; update the saved host if it moved."""
        s = self.settings
        if not s.bridge_id:
            return False
        for b in await discover(self._zeroconf):
            if b["id"].upper() == s.bridge_id.upper() and b["host"] != self.bridge.host:
                log.warning("Bridge %s moved: %s -> %s", s.bridge_id, self.bridge.host, b["host"])
                self.bridge.host = s.bridge_host = b["host"]
                await self._save()
                return True
        return False

    # ---- zones -----------------------------------------------------------

    async def list_zones(self) -> list[dict]:
        configs = await self._call(lambda b: b.entertainment_configurations())
        return [{
            "id": c["id"],
            "name": c["metadata"]["name"],
            "type": c.get("configuration_type"),
            "status": c.get("status"),
            "channel_count": len(c.get("channels", [])),
        } for c in configs]

    async def _load_zone(self, zone_id: str):
        self.zone = await self._call(lambda b: b.zone(zone_id))
        self.frame = {ch["id"]: (0.0, 0.0, 0.0) for ch in self.zone["channels"]}
        self.frame_version += 1

    async def select_zone(self, zone_id: str) -> dict:
        async with self._lock:
            if self.want_fps:
                raise BridgeError("Stop streaming before switching zones")
            await self._load_zone(zone_id)
            self.settings.selected_zone = zone_id
            await self._save()
        await self._notify()
        return self.zone

    # ---- streaming -------------------------------------------------------

    @property
    def streaming(self) -> bool:
        return bool(self.streamer and self.streamer.running)

    def _current_frame(self):
        return self.frame, self.brightness

    async def start_stream(self, fps: float = 50.0):
        """Start streaming. Errors on the first attempt go back to the caller;
        after that the watchdog keeps the stream alive."""
        if not 1 <= fps <= 60:
            raise ValueError("fps must be between 1 and 60")
        async with self._lock:
            if self.want_fps:
                return
            if not self.zone:
                raise BridgeError("Select an entertainment zone first")
            await self._open_stream(fps)
            self.want_fps = fps
        await self._notify()

    async def stop_stream(self):
        async with self._lock:
            self.want_fps = None
            await self._close_stream()
            self.stream_state, self.last_error = "off", None
        await self._notify()

    async def _open_stream(self, fps: float):
        s, zid = self.settings, self.zone["id"]
        await self._call(lambda b: b.set_streaming(zid, True))
        try:
            # The bridge accepts "start" even when another app holds the stream,
            # but then never activates the zone and ignores our handshake.
            deadline = time.monotonic() + ACTIVATE_TIMEOUT
            while await self._call(lambda b: b.zone_status(zid)) != "active":
                if time.monotonic() > deadline:
                    holder = await self._call(lambda b: b.stream_holder())
                    raise BridgeError(f"Bridge is busy: {holder or 'another app'} is streaming. "
                                      "Only one entertainment stream can run at a time.")
                await asyncio.sleep(0.25)
            streamer = DtlsStreamer(s.bridge_host, s.app_key, s.client_key, zid, self._current_frame, fps)
            await asyncio.to_thread(streamer.start)
        except BaseException:
            await self._safe_bridge_stop(zid)
            raise
        self.streamer = streamer
        self.stream_state, self.last_error = "streaming", None
        self._backoff = WATCHDOG_INTERVAL
        self._last_bridge_check = time.monotonic()

    async def _close_stream(self):
        if self.streamer:
            await asyncio.to_thread(self.streamer.stop)
            self.streamer = None
        if self.zone and self.bridge:
            await self._safe_bridge_stop(self.zone["id"])

    async def _safe_bridge_stop(self, zone_id: str):
        try:
            await self._call(lambda b: b.set_streaming(zone_id, False))
        except Exception as e:
            log.warning("stop on bridge failed: %s", e)

    async def _watch(self):
        """Reconnect the bridge and the stream when they drop."""
        while True:
            await asyncio.sleep(WATCHDOG_INTERVAL)
            try:
                if self.bridge and not self.bridge_name:
                    await self._connect_bridge()
                if self.want_fps:
                    await self._check_stream()
            except asyncio.CancelledError:
                raise
            except Exception as e:  # never let the watchdog die
                log.exception("watchdog: %s", e)

    async def _check_stream(self):
        async with self._lock:
            if not self.want_fps:
                return
            now = time.monotonic()
            lost = None
            if not self.streaming:
                lost = (self.streamer and self.streamer.error) or "stream not running"
            elif now - self._last_bridge_check >= BRIDGE_CHECK_INTERVAL:
                self._last_bridge_check = now
                try:
                    if await self._call(lambda b: b.zone_status(self.zone["id"])) != "active":
                        lost = "bridge no longer has our stream active"
                except BridgeError as e:
                    lost = str(e)
            if lost and self.stream_state == "streaming":
                log.warning("Stream lost (%s); reconnecting", lost)
                await self._close_stream()
                self.stream_state, self.last_error = "reconnecting", lost
                self._retry_at = now
                await self._notify()
            if self.stream_state != "reconnecting" or now < self._retry_at:
                return
            try:
                await self._open_stream(self.want_fps)
                log.info("Stream reconnected")
            except Exception as e:
                self.last_error = str(e)
                self._retry_at = now + self._backoff
                log.warning("Reconnect failed (%s); next try in %.0f s", e, self._backoff)
                self._backoff = min(self._backoff * 2, MAX_BACKOFF)
        await self._notify()

    # ---- colours ---------------------------------------------------------

    def set_colors(self, channels: dict | None = None, all=None, brightness: float | None = None):
        """Update the frame. Unlisted channels keep their colour."""
        if not self.zone:
            raise BridgeError("Select an entertainment zone first")
        new = dict(self.frame)
        if all is not None:
            c = parse_color(all)
            new = {ch: c for ch in new}
        for key, value in (channels or {}).items():
            ch = int(key)
            if ch not in new:
                raise ValueError(f"channel {ch} not in zone")
            new[ch] = parse_color(value)
        if brightness is not None:
            self.brightness = max(0.0, min(1.0, float(brightness)))
        self.frame = new  # swap the reference; the sender thread reads it lock-free
        self.frame_version += 1
        self._count_command()

    def _count_command(self):
        now = time.monotonic()
        self._cmd_count += 1
        if now - self._cmd_window >= 1.0:
            self.command_rate = self._cmd_count / (now - self._cmd_window)
            self._cmd_count, self._cmd_window = 0, now

    def colors(self) -> dict:
        return {"channels": {str(ch): to_hex(c) for ch, c in sorted(self.frame.items())},
                "brightness": self.brightness, "version": self.frame_version}

    # ---- status ----------------------------------------------------------

    def status(self) -> dict:
        s, st = self.settings, self.streamer
        return {
            "paired": bool(self.bridge),
            "bridge": {"host": s.bridge_host, "id": s.bridge_id, "name": self.bridge_name} if self.bridge else None,
            "zone": {"id": self.zone["id"], "name": self.zone["name"],
                     "channels": len(self.zone["channels"])} if self.zone else None,
            "streaming": {
                "active": self.streaming,
                "state": self.stream_state,
                "target_fps": self.want_fps,
                "send_fps": round(st.stats.fps, 1) if st and st.running else 0,
                "packets": st.stats.packets if st else 0,
                "error": self.last_error,
            },
            "commands_per_sec": round(self.command_rate, 1),
        }

    async def _save(self):
        result = self._save_cb(self.settings)
        if inspect.isawaitable(result):
            await result

    async def _notify(self):
        if self.on_status_change:
            await self.on_status_change()


__all__ = ["HueSyncEngine", "BridgeError", "LinkButtonNotPressed", "parse_color"]
