"""Hue bridge discovery, pairing and CLIP v2 REST calls."""

import asyncio
import logging

import httpx

log = logging.getLogger(__name__)


class BridgeError(Exception):
    pass


class LinkButtonNotPressed(BridgeError):
    pass


class AuthError(BridgeError):
    """The bridge rejected our app key (reset bridge, or the app was removed)."""


def _client() -> httpx.AsyncClient:
    # Bridges use a per-bridge certificate signed by Signify's private CA; on the
    # local network we skip verification like most Hue clients do.
    return httpx.AsyncClient(verify=False, timeout=8)


async def discover(azc=None, timeout: float = 3.0) -> list[dict]:
    """Find bridges on the local network via mDNS.

    Pass a shared AsyncZeroconf instance (Home Assistant has one); without it a
    temporary instance is created and closed again.
    """
    found: dict[str, dict] = {}

    try:
        from zeroconf import ServiceStateChange
        from zeroconf.asyncio import (
            AsyncServiceBrowser,
            AsyncServiceInfo,
            AsyncZeroconf,
        )

        own_zc = azc is None
        if own_zc:
            azc = AsyncZeroconf()
        names: set[str] = set()

        def on_change(zeroconf, service_type, name, state_change):
            if state_change is ServiceStateChange.Added:
                names.add(name)

        browser = AsyncServiceBrowser(
            azc.zeroconf, "_hue._tcp.local.", handlers=[on_change]
        )
        await asyncio.sleep(timeout)
        for name in names:
            info = AsyncServiceInfo("_hue._tcp.local.", name)
            if await info.async_request(azc.zeroconf, 2000):
                props = {
                    k.decode(): (v.decode() if v else "")
                    for k, v in info.properties.items()
                }
                addrs = info.parsed_addresses()
                if addrs:
                    bid = props.get("bridgeid", name).upper()
                    found[bid] = {
                        "id": bid,
                        "host": addrs[0],
                        "name": name.split(".")[0],
                        "model": props.get("modelid"),
                    }
        await browser.async_cancel()
        if own_zc:
            await azc.async_close()
    except Exception as e:
        log.warning("mDNS discovery failed: %s", e)

    return list(found.values())


class HueBridge:
    def __init__(
        self,
        host: str,
        app_key: str | None = None,
        http: httpx.AsyncClient | None = None,
    ):
        """`http` must skip certificate verification; without it a private client is created."""
        self.host = host
        self.app_key = app_key
        self._own_http = http is None
        self._http = http or _client()

    async def close(self):
        if self._own_http:
            await self._http.aclose()

    @property
    def _base(self) -> str:
        return f"https://{self.host}"

    async def info(self) -> dict:
        """Unauthenticated bridge info (name, id, model)."""
        r = await self._http.get(f"{self._base}/api/config")
        r.raise_for_status()
        return r.json()

    async def pair(
        self, app_name: str = "ha_hue_entertainment#core"
    ) -> tuple[str, str]:
        """Create an app key + streaming client key. Needs the link button pressed."""
        r = await self._http.post(
            f"{self._base}/api",
            json={"devicetype": app_name, "generateclientkey": True},
        )
        r.raise_for_status()
        result = r.json()[0]
        if "error" in result:
            if result["error"].get("type") == 101:
                raise LinkButtonNotPressed(
                    "Press the link button on the bridge, then try again within 30 s."
                )
            raise BridgeError(result["error"].get("description", "pairing failed"))
        return result["success"]["username"], result["success"]["clientkey"]

    async def _request(self, method: str, resource: str, json=None) -> list:
        if not self.app_key:
            raise BridgeError("Not paired")
        r = await self._http.request(
            method,
            f"{self._base}/clip/v2/resource/{resource}",
            headers={"hue-application-key": self.app_key},
            json=json,
        )
        if r.status_code in (401, 403):  # the bridge answers with an HTML page here
            raise AuthError("The bridge rejected the app key; pair again")
        try:
            body = r.json() if r.content else {}
        except ValueError as err:
            raise BridgeError(
                f"{method} {resource}: {r.status_code} unexpected response"
            ) from err
        if r.status_code >= 400 or body.get("errors"):
            msgs = (
                "; ".join(e.get("description", "") for e in body.get("errors", []))
                or r.text
            )
            raise BridgeError(f"{method} {resource}: {r.status_code} {msgs}")
        return body.get("data", [])

    async def entertainment_configurations(self) -> list[dict]:
        return await self._request("GET", "entertainment_configuration")

    async def zone(self, zone_id: str) -> dict:
        """Entertainment configuration with channel positions and light names."""
        configs, ents, devices = await asyncio.gather(
            self._request("GET", f"entertainment_configuration/{zone_id}"),
            self._request("GET", "entertainment"),
            self._request("GET", "device"),
        )
        if not configs:
            raise BridgeError(f"Zone {zone_id} not found")
        cfg = configs[0]
        dev_names = {d["id"]: d["metadata"]["name"] for d in devices}
        ent_owner = {e["id"]: dev_names.get(e["owner"]["rid"], "?") for e in ents}
        seg_count = {
            e["id"]: len((e.get("segments") or {}).get("segments", [])) or 1
            for e in ents
        }
        # Where each light really is (gradient lights: start and end point), as set
        # in the Hue app. Channel positions are the bridge's computed centres.
        placement = {
            loc["service"]["rid"]: loc.get("positions", [])
            for loc in (cfg.get("locations") or {}).get("service_locations", [])
        }
        channels, lights = [], {}
        for ch in cfg.get("channels", []):
            members = ch.get("members", [])
            rid = members[0]["service"]["rid"] if members else None
            name = ent_owner.get(rid, "?")
            # A channel can cover several segments of one gradient light.
            segments = sorted(
                m.get("index", 0) for m in members if m["service"]["rid"] == rid
            )
            multi = _multi_segment(cfg, members[0]) if members else False
            channels.append(
                {
                    "id": ch["channel_id"],
                    "position": ch["position"],
                    "lights": [_segment_label(name, segments) if multi else name],
                    "light_id": rid,
                    "light": name,
                    "segment": segments[0] if segments else 0,
                    "segments": segments,
                }
            )
            if rid and rid not in lights:
                lights[rid] = {
                    "id": rid,
                    "name": name,
                    "positions": placement.get(rid, []),
                    "segment_count": seg_count.get(rid, 1),
                }
        for ch in channels:
            light = lights.get(ch["light_id"])
            ch["placed"] = _placed(ch, light) if light else ch["position"]
        return {
            "id": cfg["id"],
            "name": cfg["metadata"]["name"],
            "type": cfg.get("configuration_type"),
            "status": cfg.get("status"),
            "channels": channels,
            "lights": list(lights.values()),
        }

    async def set_streaming(self, zone_id: str, active: bool) -> None:
        await self._request(
            "PUT",
            f"entertainment_configuration/{zone_id}",
            json={"action": "start" if active else "stop"},
        )

    async def zone_status(self, zone_id: str) -> str:
        """'active' or 'inactive'."""
        configs = await self._request("GET", f"entertainment_configuration/{zone_id}")
        return configs[0].get("status", "inactive") if configs else "inactive"

    async def active_streams(self) -> list[dict]:
        """Areas being streamed right now: [{"id", "name", "app"}]."""
        active = [
            c
            for c in await self.entertainment_configurations()
            if c.get("status") == "active"
        ]
        if not active:
            return []
        apps = {}
        try:  # app names are only exposed by the v1 whitelist
            r = await self._http.get(f"{self._base}/api/{self.app_key}/config")
            apps = r.json().get("whitelist", {})
        except Exception:
            pass
        return [
            {
                "id": c["id"],
                "name": c["metadata"]["name"],
                "app": apps.get((c.get("active_streamer") or {}).get("rid"), {})
                .get("name", "another app")
                .split("#")[0],
            }
            for c in active
        ]

    async def stream_holder(self) -> str | None:
        """Describe who is streaming right now, e.g. "'TV' by HueSyncBox", or None."""
        active = await self.active_streams()
        return f"'{active[0]['name']}' by {active[0]['app']}" if active else None


def _placed(channel: dict, light: dict) -> dict:
    """Where a channel really is: the middle of its segments along the light as
    placed in the Hue app. Falls back to the bridge's channel position."""
    points = light["positions"]
    if not points:
        return channel["position"]
    if len(points) == 1 or not channel["segments"]:
        return points[0]
    count = max(light["segment_count"], channel["segments"][-1] + 1)
    t = (channel["segments"][0] + channel["segments"][-1] + 1) / 2 / count
    # walk the polyline to fraction t of its length
    lengths = [
        sum((b[k] - a[k]) ** 2 for k in "xyz") ** 0.5
        for a, b in zip(points, points[1:], strict=False)
    ]
    target, total = t * sum(lengths), 0.0
    for (a, b), length in zip(
        zip(points, points[1:], strict=False), lengths, strict=True
    ):
        if total + length >= target and length > 0:
            f = (target - total) / length
            return {k: a[k] + (b[k] - a[k]) * f for k in "xyz"}
        total += length
    return points[-1]


def _segment_label(name: str, segments: list[int]) -> str:
    """ "Bike light 1-2" for a channel covering segments 0 and 1."""
    if not segments:
        return name
    lo, hi = segments[0] + 1, segments[-1] + 1
    return f"{name} {lo}" if lo == hi else f"{name} {lo}-{hi}"


def _multi_segment(cfg: dict, member: dict) -> bool:
    """True when the same light service appears in several channels (gradient lights)."""
    rid = member["service"]["rid"]
    return (
        sum(
            1
            for ch in cfg.get("channels", [])
            for m in ch.get("members", [])
            if m["service"]["rid"] == rid
        )
        > 1
    )
