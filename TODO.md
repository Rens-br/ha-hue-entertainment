# TODO

## Home Assistant add-on
- [ ] Confirm the Home Assistant hardware (Green / Yellow / Pi = aarch64, or x86)
- [ ] Dockerfile + add-on `config.yaml` (`host_network: true`, `HUE_ENTERTAINMENT_CONFIG=/data/config.json`)
- [ ] Verify pyOpenSSL DTLS works inside the container on the real device
- [ ] Optional: serve the debug UI through ingress
- [ ] Later: thin custom integration exposing entities (sync on/off switch, zone select, stream state)

## Behaviour decisions
- [ ] Sync Box conflict: setting for whether recovery takes the lights back when another app stops
- [ ] Restart: resume a stream that was running before the server restarted?

## Quality
- [ ] Unit tests: packet building, colour parsing, zone/channel validation
- [ ] Watch pyOpenSSL upgrades: the PSK callback uses its private cffi bindings (`OpenSSL._util`)

## Known limitations
- Localhost only, no authentication. Add auth before exposing it on the network.
- A bridge runs one entertainment stream at a time; the Hue Sync Box blocks this server while it syncs.
