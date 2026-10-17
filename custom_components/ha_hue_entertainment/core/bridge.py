"""Hue bridge discovery, pairing and CLIP v2 REST calls."""
import asyncio
import logging

import httpx

log = logging.getLogger(__name__)


class BridgeError(Exception):
    pass


class LinkButtonNotPressed(BridgeError):
    pass


def _client() -> httpx.AsyncClient:
    # Bridges use a per-bridge certificate signed by Signify's private CA; on the
    # local network we skip verification like most Hue clients do.
    return httpx.AsyncClient(verify=False, timeout=8)


async def discover(timeout: float = 3.0) -> list[dict]:
    """Find bridges on the local network via mDNS."""
    found: dict[str, dict] = {}

    try:
        from zeroconf import ServiceStateChange
        from zeroconf.asyncio import AsyncServiceBrowser, AsyncServiceInfo, AsyncZeroconf

        azc = AsyncZeroconf()
        names: set[str] = set()

        def on_change(zeroconf, service_type, name, state_change):
            if state_change is ServiceStateChange.Added:
                names.add(name)

        browser = AsyncServiceBrowser(azc.zeroconf, "_hue._tcp.local.", handlers=[on_change])
        await asyncio.sleep(timeout)
        for name in names:
            info = AsyncServiceInfo("_hue._tcp.local.", name)
            if await info.async_request(azc.zeroconf, 2000):
                props = {k.decode(): (v.decode() if v else "") for k, v in info.properties.items()}
                addrs = info.parsed_addresses()
                if addrs:
                    bid = props.get("bridgeid", name).upper()
                    found[bid] = {"id": bid, "host": addrs[0], "name": name.split(".")[0],
                                  "model": props.get("modelid")}
        await browser.async_cancel()
        await azc.async_close()
    except Exception as e:
        log.warning("mDNS discovery failed: %s", e)

    return list(found.values())


class HueBridge:
    def __init__(self, host: str, app_key: str | None = None):
        self.host = host
        self.app_key = app_key
        self._http = _client()

    async def close(self):
        await self._http.aclose()

    @property
    def _base(self) -> str:
        return f"https://{self.host}"

    async def info(self) -> dict:
        """Unauthenticated bridge info (name, id, model)."""
        r = await self._http.get(f"{self._base}/api/config")
        r.raise_for_status()
        return r.json()

    async def pair(self, app_name: str = "ha_hue_entertainment#core") -> tuple[str, str]:
        """Create an app key + streaming client key. Needs the link button pressed."""
        r = await self._http.post(f"{self._base}/api", json={"devicetype": app_name, "generateclientkey": True})
        r.raise_for_status()
        result = r.json()[0]
        if "error" in result:
            if result["error"].get("type") == 101:
                raise LinkButtonNotPressed("Press the link button on the bridge, then try again within 30 s.")
            raise BridgeError(result["error"].get("description", "pairing failed"))
        return result["success"]["username"], result["success"]["clientkey"]

    async def _request(self, method: str, resource: str, json=None) -> list:
        if not self.app_key:
            raise BridgeError("Not paired")
        r = await self._http.request(
            method, f"{self._base}/clip/v2/resource/{resource}",
            headers={"hue-application-key": self.app_key}, json=json,
        )
        body = r.json() if r.content else {}
        if r.status_code >= 400 or body.get("errors"):
            msgs = "; ".join(e.get("description", "") for e in body.get("errors", [])) or r.text
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
        channels = []
        for ch in cfg.get("channels", []):
            names = []
            for m in ch.get("members", []):
                name = ent_owner.get(m["service"]["rid"], "?")
                idx = m.get("index", 0)
                names.append(f"{name} #{idx + 1}" if _multi_segment(cfg, m) else name)
            channels.append({"id": ch["channel_id"], "position": ch["position"], "lights": names})
        return {
            "id": cfg["id"],
            "name": cfg["metadata"]["name"],
            "type": cfg.get("configuration_type"),
            "status": cfg.get("status"),
            "channels": channels,
        }

    async def set_streaming(self, zone_id: str, active: bool) -> None:
        await self._request("PUT", f"entertainment_configuration/{zone_id}",
                            json={"action": "start" if active else "stop"})

    async def zone_status(self, zone_id: str) -> str:
        """'active' or 'inactive'."""
        configs = await self._request("GET", f"entertainment_configuration/{zone_id}")
        return configs[0].get("status", "inactive") if configs else "inactive"

    async def stream_holder(self) -> str | None:
        """Describe who is streaming right now, e.g. "'TV' by HueSyncBox", or None."""
        active = [c for c in await self.entertainment_configurations() if c.get("status") == "active"]
        if not active:
            return None
        cfg = active[0]
        app = "another app"
        owner = (cfg.get("active_streamer") or {}).get("rid")
        try:  # app names are only exposed by the v1 whitelist
            r = await self._http.get(f"{self._base}/api/{self.app_key}/config")
            app = r.json().get("whitelist", {}).get(owner, {}).get("name", app).split("#")[0]
        except Exception:
            pass
        return f"'{cfg['metadata']['name']}' by {app}"


def _multi_segment(cfg: dict, member: dict) -> bool:
    """True when the same light service appears in several channels (gradient lights)."""
    rid = member["service"]["rid"]
    return sum(1 for ch in cfg.get("channels", []) for m in ch.get("members", [])
               if m["service"]["rid"] == rid) > 1
