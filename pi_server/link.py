"""Drive a DMG link port from the Pi, or talk to GbSlaveSim in tests.

The Pi clocks the bus slowly. Python on Raspberry Pi OS cannot reliably
sample the Game Boy's internal 8192 Hz clock from userspace.
"""

from __future__ import annotations

import logging
import os
import time

from pi_server.model import DexError
from pi_server.protocol import (
    CMD_ACK,
    CMD_HELLO,
    CMD_IDLE,
    EVT_A,
    EVT_B,
    EVT_DOWN,
    EVT_LEFT,
    EVT_NAK,
    EVT_RIGHT,
    EVT_UP,
    build_packet,
    build_poll,
    contact_entry,
    encode_show,
    extract_event,
)

log = logging.getLogger("pokedex.link")


class LinkSession:
    def __init__(self, transport, store):
        self.transport = transport
        self.store = store
        self.cursor = 0
        self.shown_id = None
        self.shown_sig = None
        self.hold = None
        self.acted = False
        self.started = False

    def start(self) -> None:
        self.transport.exchange(build_packet(CMD_HELLO))
        self.started = True
        self.refresh()

    def tick(self) -> None:
        if not self.started:
            self.start()
            return
        event = extract_event(self.transport.exchange(build_poll()))
        if event == EVT_NAK:
            self.refresh()
            return
        if event == 0:
            if self.hold:
                self.hold = None
                self.acted = False
                self.refresh()
            else:
                self._refresh_if_stale()
            return
        if event != self.hold:
            self.hold = event
            self.acted = False
        if not self.acted:
            self._act(event)
            self.acted = True
        self.transport.exchange(build_packet(CMD_ACK))

    def _act(self, event: int) -> None:
        if event == EVT_A and self.shown_id:
            try:
                self.store.approve_contact(self.shown_id)
            except DexError:
                pass
        elif event == EVT_B and self.shown_id:
            try:
                self.store.skip_contact(self.shown_id)
            except DexError:
                pass
        elif event == EVT_LEFT:
            self.cursor = max(0, self.cursor - 1)
        elif event == EVT_RIGHT:
            contacts = self._contacts()
            if contacts:
                self.cursor = min(len(contacts) - 1, self.cursor + 1)
        # Up and down scroll on the Game Boy itself.

    def _contacts(self) -> list[dict]:
        if hasattr(self.store, "read"):
            from pi_server.model import list_contacts

            return self.store.read(list_contacts)
        return self.store.list_contacts()

    def _refresh_if_stale(self) -> None:
        contacts = self._contacts()
        if not contacts:
            if self.shown_id is not None:
                self.refresh()
            return
        if self.cursor >= len(contacts):
            self.cursor = len(contacts) - 1
        contact = contacts[self.cursor]
        if self._signature(contact) != self.shown_sig:
            self.refresh()

    def refresh(self) -> None:
        contacts = self._contacts()
        if not contacts:
            self.shown_id = None
            self.shown_sig = None
            self.cursor = 0
            self.transport.exchange(build_packet(CMD_IDLE))
            return
        self.cursor = max(0, min(self.cursor, len(contacts) - 1))
        contact = contacts[self.cursor]
        self.shown_id = contact["id"]
        self.shown_sig = self._signature(contact)
        packet = encode_show(contact_entry(contact, self.cursor + 1, len(contacts)))
        self.transport.exchange(packet)
        rx = self.transport.exchange(build_poll())
        if extract_event(rx) == EVT_NAK:
            self.transport.exchange(packet)

    @staticmethod
    def _signature(contact: dict):
        followup = contact.get("followup") or {}
        return (
            contact["id"],
            contact.get("status"),
            contact.get("name"),
            contact.get("flavor_text"),
            contact.get("followup_status"),
            followup.get("status"),
            followup.get("body"),
        )


def gpio_transport():
    """Bit-bang the link. Returns None when GPIO is not available."""
    try:
        return GpioTransport()
    except Exception as exc:
        log.warning("link cable not available: %s", exc)
        return None


class GpioTransport:
    def __init__(self):
        import lgpio

        self.lgpio = lgpio
        self.clk = int(os.environ.get("LINK_CLK_PIN", "25"))
        self.sin = int(os.environ.get("LINK_SIN_PIN", "24"))
        self.sout = int(os.environ.get("LINK_SOUT_PIN", "23"))
        self.half = int(os.environ.get("LINK_HALF_PERIOD_US", "200")) / 1_000_000
        self.gap = int(os.environ.get("LINK_GAP_US", "1500")) / 1_000_000
        self.idle_high = os.environ.get("LINK_CLK_IDLE", "high").lower() != "low"
        self.chip = lgpio.gpiochip_open(0)
        idle = 1 if self.idle_high else 0
        lgpio.gpio_claim_output(self.chip, self.clk, idle)
        lgpio.gpio_claim_output(self.chip, self.sin, 0)
        lgpio.gpio_claim_input(self.chip, self.sout)

    def exchange(self, data: bytes) -> bytes:
        out = bytearray()
        for byte in data:
            out.append(self._shift(byte))
            time.sleep(self.gap)
        return bytes(out)

    def _shift(self, byte: int) -> int:
        received = 0
        for bit in range(7, -1, -1):
            self.lgpio.gpio_write(self.chip, self.sin, (byte >> bit) & 1)
            self._wait(self.half)
            self.lgpio.gpio_write(self.chip, self.clk, 0 if self.idle_high else 1)
            self._wait(self.half)
            received = (received << 1) | (1 if self.lgpio.gpio_read(self.chip, self.sout) else 0)
            self.lgpio.gpio_write(self.chip, self.clk, 1 if self.idle_high else 0)
            self._wait(self.half)
        return received

    @staticmethod
    def _wait(seconds: float) -> None:
        end = time.perf_counter() + seconds
        while time.perf_counter() < end:
            pass


def run_link_forever(store, stop) -> None:
    transport = gpio_transport()
    if transport is None:
        log.warning("bridge has no link cable; Game Boy screen will stay on the browser")
        while not stop.is_set():
            stop.wait(0.5)
        return
    session = LinkSession(transport, store)
    while not stop.is_set():
        try:
            session.tick()
        except Exception:
            log.exception("link tick failed")
        stop.wait(0.02)
