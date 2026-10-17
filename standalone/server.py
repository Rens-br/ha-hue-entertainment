"""HTTP + WebSocket API over HueSyncEngine.

REST for setup and occasional commands, WebSocket for high-rate colour frames
and live state. All endpoints live under /api/v1. Interactive docs at /docs.

Run from the repository root:  python -m standalone.server [--port 8080]
Config file: data/config.json, or the path in HUE_ENTERTAINMENT_CONFIG.
"""
import argparse
import asyncio
import contextlib
import logging
import os
import sys
from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

REPO = Path(__file__).resolve().parent.parent
# The core lives inside the integration folder. Import it as a top-level package
# so the integration's __init__ (which needs Home Assistant) is never loaded.
sys.path.insert(0, str(REPO / "custom_components" / "ha_hue_entertainment"))

from core.bridge import BridgeError, LinkButtonNotPressed  # noqa: E402
from core.engine import HueSyncEngine  # noqa: E402

from .config_store import ConfigStore  # noqa: E402

CONFIG_ENV = "HUE_ENTERTAINMENT_CONFIG"
DEFAULT_CONFIG = REPO / "data" / "config.json"

log = logging.getLogger("ha_hue_entertainment.standalone")

COLOR_PUSH_HZ = 20  # live colour updates to subscribers (previews)


# ---- request models ------------------------------------------------------

ColorValue = list[float] | str


class PairRequest(BaseModel):
    host: str = Field(description="Bridge IP or hostname")


class ZoneSelect(BaseModel):
    zone_id: str


class StreamStart(BaseModel):
    fps: float = Field(50, ge=1, le=60, description="Packets per second sent to the bridge")


class ColorsRequest(BaseModel):
    channels: dict[str, ColorValue] | None = Field(
        None, description='Per-channel colours, e.g. {"0": [255, 0, 0], "3": "#00ff00"}')
    all: ColorValue | None = Field(None, description="Set every channel to this colour first")
    brightness: float | None = Field(None, ge=0, le=1, description="Global brightness multiplier")


# ---- app -----------------------------------------------------------------

def create_app() -> FastAPI:
    store = ConfigStore(os.environ.get(CONFIG_ENV, DEFAULT_CONFIG))
    engine = HueSyncEngine(store.settings, store.save, app_name="ha_hue_entertainment#standalone")
    sockets: set["Client"] = set()

    async def broadcast_status():
        msg = {"type": "status", **engine.status()}
        for c in list(sockets):
            await c.send(msg)

    engine.add_listener(broadcast_status)

    async def pusher():
        """Status every second; colours at COLOR_PUSH_HZ to subscribers when changed."""
        tick = 0
        while True:
            await asyncio.sleep(1 / COLOR_PUSH_HZ)
            tick += 1
            if sockets and engine.zone:
                colors = None
                for c in list(sockets):
                    if c.want_colors and c.seen_version != engine.frame_version:
                        colors = colors or {"type": "colors", **engine.colors()}
                        c.seen_version = engine.frame_version
                        await c.send(colors)
            if tick % COLOR_PUSH_HZ == 0:
                await broadcast_status()

    @contextlib.asynccontextmanager
    async def lifespan(app):
        await engine.startup()
        task = asyncio.create_task(pusher())
        yield
        task.cancel()
        await engine.shutdown()

    app = FastAPI(title="Hue Entertainment Server", version="1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    app.state.engine = engine

    @app.exception_handler(LinkButtonNotPressed)
    async def _link(_, e):
        return JSONResponse({"error": str(e), "code": "link_button"}, status_code=428)

    @app.exception_handler(BridgeError)
    async def _bridge(_, e):
        return JSONResponse({"error": str(e), "code": "bridge"}, status_code=409)

    @app.exception_handler(ValueError)
    async def _value(_, e):
        return JSONResponse({"error": str(e), "code": "invalid"}, status_code=400)

    api = APIRouter(prefix="/api/v1")

    @api.get("/status", summary="Server, bridge, zone and stream state")
    async def status():
        return engine.status()

    @api.get("/bridges/discover", summary="Find Hue bridges on the network")
    async def discover():
        return await engine.discover()

    @api.post("/bridge/pair", summary="Pair with a bridge (press its link button first)",
              responses={428: {"description": "Link button not pressed"}})
    async def pair(req: PairRequest):
        return await engine.pair(req.host)

    @api.delete("/bridge", summary="Forget the paired bridge")
    async def forget():
        await engine.forget()
        return {"ok": True}

    @api.get("/zones", summary="List entertainment zones")
    async def zones():
        return await engine.list_zones()

    @api.get("/zone", summary="Selected zone with channels, positions and lights")
    async def zone():
        if not engine.zone:
            raise HTTPException(404, "No zone selected")
        return engine.zone

    @api.post("/zone", summary="Select an entertainment zone")
    async def select_zone(req: ZoneSelect):
        return await engine.select_zone(req.zone_id)

    @api.post("/stream/start", summary="Start entertainment streaming")
    async def start(req: StreamStart | None = None):
        await engine.start_stream((req or StreamStart()).fps)
        return engine.status()["streaming"]

    @api.post("/stream/stop", summary="Stop streaming; lights return to normal control")
    async def stop():
        await engine.stop_stream()
        return engine.status()["streaming"]

    @api.get("/colors", summary="Current colour frame")
    async def get_colors():
        return engine.colors()

    @api.put("/colors", summary="Set channel colours (use the WebSocket for high rates)")
    async def put_colors(req: ColorsRequest):
        engine.set_colors(req.channels, req.all, req.brightness)
        return engine.colors()

    @api.websocket("/ws")
    async def ws(websocket: WebSocket):
        await websocket.accept()
        client = Client(websocket)
        sockets.add(client)
        try:
            await client.send({"type": "status", **engine.status()})
            while True:
                msg = await websocket.receive_json()
                kind = msg.get("type")
                try:
                    if kind == "colors":
                        engine.set_colors(msg.get("channels"), msg.get("all"), msg.get("brightness"))
                    elif kind == "subscribe":
                        client.want_colors = bool(msg.get("colors", True))
                        client.seen_version = -1
                    elif kind == "ping":
                        await client.send({"type": "pong", "id": msg.get("id")})
                    else:
                        raise ValueError(f"unknown message type {kind!r}")
                except (ValueError, BridgeError) as e:
                    await client.send({"type": "error", "message": str(e), "for": kind})
        except WebSocketDisconnect:
            pass
        finally:
            sockets.discard(client)

    app.include_router(api)
    return app


class Client:
    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.want_colors = False
        self.seen_version = -1

    async def send(self, msg: dict):
        try:
            await self.ws.send_json(msg)
        except Exception:
            pass


def main():
    ap = argparse.ArgumentParser(description="Hue Entertainment streaming server")
    ap.add_argument("--port", type=int, default=8080)
    args = ap.parse_args()

    import uvicorn
    # Everything (ours and uvicorn's) goes to stdout, which add-on log viewers show.
    logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    uvicorn.run(create_app(), host="127.0.0.1", port=args.port, log_config=None)


if __name__ == "__main__":
    main()
