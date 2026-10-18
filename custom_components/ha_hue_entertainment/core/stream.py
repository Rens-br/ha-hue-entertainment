"""HueStream v2 over DTLS 1.2 (PSK) to UDP port 2100, using OpenSSL via pyOpenSSL.

A sender thread pushes the latest colour frame at a fixed rate. The bridge
forwards ~25 updates/s to the lights over Zigbee and drops the stream after
~10 s without packets, so we keep sending even when colours don't change.

pyOpenSSL has no public API for a PSK client callback, so we register one
through its cffi bindings (OpenSSL._util). Keep pyOpenSSL pinned.
"""

import logging
import select
import socket
import struct
import threading
import time

from OpenSSL import SSL
from OpenSSL._util import ffi, lib

log = logging.getLogger(__name__)

STREAM_PORT = 2100
MAX_CHANNELS = 20
DTLS1_2_VERSION = 0xFEFD
CIPHER = b"PSK-AES128-GCM-SHA256"
HANDSHAKE_TIMEOUT = 10


class StreamClosed(ConnectionError):
    """The bridge ended our session on purpose (another app took over, or the area was stopped)."""


# Colours are (r, g, b) floats in 0..1, keyed by channel id.
Frame = dict[int, tuple[float, float, float]]


def build_packet(
    zone_id: str, seq: int, frame: Frame, brightness: float = 1.0
) -> bytes:
    header = (
        b"HueStream"
        + bytes([0x02, 0x00])  # protocol version 2.0
        + bytes([seq & 0xFF])  # sequence id (ignored by the bridge)
        + bytes([0x00, 0x00])  # reserved
        + bytes([0x00])  # colour space: RGB
        + bytes([0x00])  # reserved
        + zone_id.encode("ascii")  # 36-char entertainment configuration id
    )
    body = b"".join(
        struct.pack(">BHHH", ch, *(_u16(c * brightness) for c in rgb))
        for ch, rgb in sorted(frame.items())[:MAX_CHANNELS]
    )
    return header + body


def _u16(v: float) -> int:
    return max(0, min(65535, round(v * 65535)))


class StreamStats:
    def __init__(self):
        self.packets = 0
        self.fps = 0.0
        self._window_start = time.monotonic()
        self._window_count = 0

    def tick(self):
        self.packets += 1
        self._window_count += 1
        now = time.monotonic()
        if now - self._window_start >= 1.0:
            self.fps = self._window_count / (now - self._window_start)
            self._window_start, self._window_count = now, 0


class DtlsStreamer:
    """Opens the DTLS session, then sends frames from `get_frame()` at `fps`."""

    def __init__(
        self,
        host: str,
        app_key: str,
        client_key: str,
        zone_id: str,
        get_frame,
        fps: float = 50.0,
    ):
        self.host, self.zone_id, self.fps = host, zone_id, fps
        self.get_frame = get_frame  # -> (Frame, brightness)
        self.stats = StreamStats()
        self.error: str | None = None
        self.closed_by_bridge = (
            False  # True when the bridge ended the session deliberately
        )
        self._identity = app_key.encode()
        self._psk = bytes.fromhex(client_key)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._sock: socket.socket | None = None
        self._conn: SSL.Connection | None = None
        self._psk_cb = None  # keep the cffi callback alive

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def start(self):
        self._open()
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._loop, name="hue-stream", daemon=True
        )
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
        self._close()

    # ---- DTLS ------------------------------------------------------------

    def _context(self) -> SSL.Context:
        ctx = SSL.Context(SSL.DTLS_CLIENT_METHOD)
        ctx.set_min_proto_version(DTLS1_2_VERSION)
        ctx.set_max_proto_version(DTLS1_2_VERSION)
        ctx.set_cipher_list(CIPHER)

        identity, psk = self._identity, self._psk

        @ffi.callback(
            "unsigned int(SSL *, const char *, char *, unsigned int, unsigned char *, unsigned int)"
        )
        def psk_cb(_ssl, _hint, out_identity, max_identity, out_psk, max_psk):
            if len(identity) + 1 > max_identity or len(psk) > max_psk:
                return 0
            ffi.memmove(out_identity, identity + b"\0", len(identity) + 1)
            ffi.memmove(out_psk, psk, len(psk))
            return len(psk)

        self._psk_cb = psk_cb
        lib.SSL_CTX_set_psk_client_callback(ctx._context, psk_cb)
        return ctx

    def _open(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect((socket.gethostbyname(self.host), STREAM_PORT))
        conn = SSL.Connection(
            self._context(), None
        )  # memory BIOs; we move the datagrams
        conn.set_connect_state()
        self._sock, self._conn = sock, conn

        deadline = time.monotonic() + HANDSHAKE_TIMEOUT
        while True:
            try:
                conn.do_handshake()
                self._flush()
                break
            except SSL.WantReadError:
                self._flush()
            if time.monotonic() > deadline:
                self._close()
                raise TimeoutError("DTLS handshake timed out (bridge did not answer)")
            ready, _, _ = select.select([sock], [], [], 0.2)
            if ready:
                conn.bio_write(sock.recv(4096))
            else:
                conn.DTLSv1_handle_timeout()  # retransmit the flight if due
        log.info(
            "DTLS stream open to %s:%d (%s)",
            self.host,
            STREAM_PORT,
            conn.get_cipher_name(),
        )

    def _flush(self):
        while True:
            try:
                self._sock.send(self._conn.bio_read(4096))
            except SSL.WantReadError:
                return

    def _check_incoming(self):
        """Raise StreamClosed if the bridge ended the session (close_notify or an alert)."""
        while select.select([self._sock], [], [], 0)[0]:
            self._conn.bio_write(self._sock.recv(4096))
            try:
                self._conn.recv(4096)
            except SSL.WantReadError:
                pass
            except (SSL.ZeroReturnError, SSL.Error) as e:
                raise StreamClosed("the bridge ended the stream") from e

    def _send(self, packet: bytes):
        self._conn.send(packet)
        self._flush()

    def _close(self):
        if self._conn:
            try:
                self._conn.shutdown()
                self._flush()
            except Exception:
                pass
        if self._sock:
            self._sock.close()
        self._conn = self._sock = None

    # ---- sender loop -------------------------------------------------------

    def _loop(self):
        seq = 0
        next_t = time.monotonic()
        while not self._stop.is_set():
            frame, brightness = self.get_frame()
            try:
                self._check_incoming()
                self._send(build_packet(self.zone_id, seq, frame, brightness))
                self.stats.tick()
            except StreamClosed as e:
                self.closed_by_bridge = True
                self.error = str(e)
                log.info(self.error)
                break
            except Exception as e:
                self.error = f"stream lost: {e}"
                log.error(self.error)
                break
            seq += 1
            next_t += 1.0 / self.fps
            delay = next_t - time.monotonic()
            if delay > 0:
                self._stop.wait(delay)
            else:
                next_t = time.monotonic()  # fell behind; don't burst
