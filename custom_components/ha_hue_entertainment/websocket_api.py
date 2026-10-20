"""WebSocket commands for the panel and for live control clients.

Anything that changes the setup (area, sync, scenes, override, ...) is admin-only.
Live control (claim, frame, release) and reading state (status, subscribe) work
for any logged-in user, so an external client can use a token of a dedicated
non-admin user instead of an admin token.

All commands take an optional entry_id; with one bridge it can be left out.
The subscription pushes {"type": "status", ...} on every change and
{"type": "colors", ...} (what the lights show) up to 20 times a second.

Live control: live/claim is a subscription that holds control while open. It
sends {"type": "claimed", "client_id", "zone"} and, if something else takes
over, {"type": "control_lost", "reason"}. Frames go through live/frame with the
client_id. Closing the subscription (or disconnecting) releases control.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_interval
import voluptuous as vol

from .const import DOMAIN
from .core.bridge import BridgeError
from .core.engine import HueSyncEngine
from .core.scenes import SceneError

COLOR_PUSH_INTERVAL = timedelta(seconds=0.05)
ENTRY = {vol.Optional("entry_id"): str}
COLOR = vol.Any(str, [vol.Coerce(float)])


def async_register(hass: HomeAssistant) -> None:
    for command in (
        ws_status,
        ws_zones,
        ws_select_zone,
        ws_sync,
        ws_override,
        ws_scenes,
        ws_scenes_upload,
        ws_reload_scenes,
        ws_delete_scene,
        ws_play_scene,
        ws_stop_scene,
        ws_scene,
        ws_speed,
        ws_set_colors,
        ws_subscribe,
        ws_live_claim,
        ws_live_frame,
        ws_live_release,
        ws_live_revoke,
    ):
        websocket_api.async_register_command(hass, command)


def _engine(hass: HomeAssistant, msg: dict) -> HueSyncEngine:
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    if "entry_id" in msg:
        entries = [e for e in entries if e.entry_id == msg["entry_id"]]
    if len(entries) != 1:
        raise BridgeError(
            "No loaded bridge with that entry_id"
            if "entry_id" in msg
            else "Pass entry_id: zero or several bridges are set up"
        )
    return entries[0].runtime_data


def _entry(hass: HomeAssistant, engine: HueSyncEngine):
    return next(
        e
        for e in hass.config_entries.async_loaded_entries(DOMAIN)
        if e.runtime_data is engine
    )


def _snapshot(engine: HueSyncEngine) -> dict[str, Any]:
    return {**engine.status(), "zone_layout": engine.zone}


def _command(admin: bool):
    """Async command; engine errors become clean error replies."""

    def decorate(func):
        @websocket_api.async_response
        async def wrapper(hass, connection, msg):
            try:
                result = await func(hass, _engine(hass, msg), msg)
            except (BridgeError, SceneError, ValueError) as err:
                connection.send_error(msg["id"], "failed", str(err))
                return
            connection.send_result(msg["id"], result)

        wrapper.__name__ = func.__name__
        return websocket_api.require_admin(wrapper) if admin else wrapper

    return decorate


_handler = _command(admin=True)  # changes the setup: admins only
_user = _command(admin=False)  # live control and reading state: any logged-in user


def _scene_list(engine: HueSyncEngine) -> list[dict[str, Any]]:
    return [
        {
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "author": s.author,
            "builtin": s.builtin,
            "duration": s.duration,
            "parameters": s.parameters,
        }
        for s in sorted(engine.scenes.values(), key=lambda s: s.name.lower())
    ]


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/status", **ENTRY})
@_user
async def ws_status(hass, engine, msg):
    return _snapshot(engine)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/zones", **ENTRY})
@_handler
async def ws_zones(hass, engine, msg):
    return await engine.list_zones()


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/zone/select",
        vol.Required("zone_id"): str,
        **ENTRY,
    }
)
@_handler
async def ws_select_zone(hass, engine, msg):
    await engine.select_zone(msg["zone_id"])
    return _snapshot(engine)


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/sync", vol.Required("on"): bool, **ENTRY}
)
@_handler
async def ws_sync(hass, engine, msg):
    if msg["on"]:
        await engine.start_stream()
    else:
        await engine.stop_stream()
    return _snapshot(engine)


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/override", vol.Required("allow"): bool, **ENTRY}
)
@_handler
async def ws_override(hass, engine, msg):
    from . import async_set_allow_override  # avoid an import cycle

    await async_set_allow_override(hass, _entry(hass, engine), msg["allow"])
    return _snapshot(engine)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/scenes", **ENTRY})
@_handler
async def ws_scenes(hass, engine, msg):
    return _scene_list(engine)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/scene",
        vol.Required("scene"): str,
        **ENTRY,
    }
)
@_handler
async def ws_scene(hass, engine, msg):
    return engine.get_scene(msg["scene"]).raw


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/scene/play",
        vol.Required("scene"): str,
        vol.Optional("params"): dict,
        vol.Optional("speed"): vol.All(vol.Coerce(float), vol.Range(min=0.1, max=4)),
        vol.Optional("start", default=True): bool,
        **ENTRY,
    }
)
@_handler
async def ws_play_scene(hass, engine, msg):
    if "speed" in msg:
        await engine.set_speed(msg["speed"])
    await engine.play_scene(msg["scene"], msg.get("params"))
    if msg["start"] and not engine.want_fps:
        await engine.start_stream()
    return _snapshot(engine)


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/scene/stop", **ENTRY}
)
@_handler
async def ws_stop_scene(hass, engine, msg):
    await engine.stop_scene()
    return _snapshot(engine)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/scenes/upload",
        vol.Required("scene"): dict,
        **ENTRY,
    }
)
@_handler
async def ws_scenes_upload(hass, engine, msg):
    from . import async_upload_scene  # avoid an import cycle

    await async_upload_scene(hass, _entry(hass, engine), msg["scene"])
    return _scene_list(engine)


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/scenes/reload", **ENTRY}
)
@_handler
async def ws_reload_scenes(hass, engine, msg):
    from . import async_reload_scenes  # avoid an import cycle

    await async_reload_scenes(hass, _entry(hass, engine))
    return _scene_list(engine)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/scenes/delete",
        vol.Required("scene_id"): str,
        **ENTRY,
    }
)
@_handler
async def ws_delete_scene(hass, engine, msg):
    from . import async_delete_scene  # avoid an import cycle

    await async_delete_scene(hass, _entry(hass, engine), msg["scene_id"])
    return _scene_list(engine)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/speed",
        vol.Required("speed"): vol.All(vol.Coerce(float), vol.Range(min=0.1, max=4)),
        **ENTRY,
    }
)
@_handler
async def ws_speed(hass, engine, msg):
    await engine.set_speed(msg["speed"])
    return _snapshot(engine)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/colors/set",
        vol.Optional("channels"): {vol.Coerce(int): COLOR},
        vol.Optional("all"): COLOR,
        vol.Optional("brightness"): vol.All(vol.Coerce(float), vol.Range(min=0, max=1)),
        vol.Optional("overlay", default=False): bool,
        vol.Optional("duration"): vol.All(vol.Coerce(float), vol.Range(min=0.1)),
        vol.Optional("clear_overlay", default=False): bool,
        vol.Optional("start", default=True): bool,
        **ENTRY,
    }
)
@_handler
async def ws_set_colors(hass, engine, msg):
    engine.set_colors(
        channels={str(ch): c for ch, c in msg.get("channels", {}).items()},
        all=msg.get("all"),
        brightness=msg.get("brightness"),
        overlay=msg["overlay"],
        duration=msg.get("duration"),
        clear_overlay=msg["clear_overlay"],
    )
    if msg["start"] and not engine.want_fps:
        await engine.start_stream()
    await engine.notify_changed()
    return engine.colors()


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/subscribe",
        vol.Optional("colors", default=True): bool,
        **ENTRY,
    }
)
@callback
def ws_subscribe(hass: HomeAssistant, connection, msg: dict) -> None:
    try:
        engine = _engine(hass, msg)
    except BridgeError as err:
        connection.send_error(msg["id"], "failed", str(err))
        return

    @callback
    def send_status() -> None:
        connection.send_message(
            websocket_api.event_message(
                msg["id"], {"type": "status", **_snapshot(engine)}
            )
        )

    seen = {"version": -1}

    @callback
    def send_colors(_now=None) -> None:
        if engine.frame_version != seen["version"]:
            seen["version"] = engine.frame_version
            connection.send_message(
                websocket_api.event_message(
                    msg["id"], {"type": "colors", **engine.colors()}
                )
            )

    remove_listener = engine.add_listener(send_status)
    cancel_timer = (
        async_track_time_interval(hass, send_colors, COLOR_PUSH_INTERVAL)
        if msg["colors"]
        else None
    )

    @callback
    def unsubscribe() -> None:
        remove_listener()
        if cancel_timer:
            cancel_timer()

    connection.subscriptions[msg["id"]] = unsubscribe
    connection.send_result(msg["id"])
    send_status()
    if msg["colors"]:
        send_colors()


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/live/claim",
        vol.Required("name"): str,
        vol.Optional("start", default=True): bool,
        **ENTRY,
    }
)
@websocket_api.async_response
async def ws_live_claim(hass: HomeAssistant, connection, msg: dict) -> None:
    """Hold live control while this subscription is open."""
    try:
        engine = _engine(hass, msg)
    except BridgeError as err:
        connection.send_error(msg["id"], "failed", str(err))
        return

    @callback
    def on_lost(reason: str) -> None:
        connection.send_message(
            websocket_api.event_message(
                msg["id"], {"type": "control_lost", "reason": reason}
            )
        )

    try:
        client_id = await engine.claim_live(msg["name"], on_lost)
        if msg["start"] and not engine.want_fps:
            await engine.start_stream()
    except (BridgeError, ValueError) as err:
        connection.send_error(msg["id"], "failed", str(err))
        return

    @callback
    def release() -> None:
        hass.async_create_task(engine.release_live(client_id))

    connection.subscriptions[msg["id"]] = release
    connection.send_result(msg["id"])
    connection.send_message(
        websocket_api.event_message(
            msg["id"], {"type": "claimed", "client_id": client_id, "zone": engine.zone}
        )
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/live/frame",
        vol.Required("client_id"): str,
        vol.Optional("channels"): {vol.Coerce(int): COLOR},
        vol.Optional("all"): COLOR,
        vol.Optional("brightness"): vol.All(vol.Coerce(float), vol.Range(min=0, max=1)),
        **ENTRY,
    }
)
@_user
async def ws_live_frame(hass, engine, msg):
    engine.live_frame(
        msg["client_id"],
        channels={str(ch): c for ch, c in msg.get("channels", {}).items()},
        all=msg.get("all"),
        brightness=msg.get("brightness"),
    )
    return None


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/live/release",
        vol.Required("client_id"): str,
        **ENTRY,
    }
)
@_user
async def ws_live_release(hass, engine, msg):
    await engine.release_live(msg["client_id"])
    return _snapshot(engine)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/live/revoke",
        vol.Optional("reason", default="taken over from the panel"): str,
        **ENTRY,
    }
)
@_handler
async def ws_live_revoke(hass, engine, msg):
    await engine.revoke_live(msg["reason"])
    return _snapshot(engine)
