# Link cable protocol

The Raspberry Pi is the clock master. The Game Boy ROM uses the external clock (`SC = 0x80`). Python on Raspberry Pi OS cannot reliably sample the DMG's internal 8192 Hz clock from userspace, so the Pi clocks the bus slowly and the Game Boy's shift register does the timing.

## Wiring

Looking into the link socket on the DMG, left to right as usually numbered:

| Pin | Signal | Connect |
| --- | --- | --- |
| 1 | +5 V | Level-shifter HV only. Never to a Pi GPIO or to Pi 3.3 V. |
| 2 | SO (Game Boy out) | Shifter HV side, then Pi BCM 23 input. This pin is 5 V. |
| 3 | SI (Game Boy in) | Pi BCM 24 output, through the shifter. |
| 4 | SC (clock) | Pi BCM 25 output, through the shifter. Pi drives the clock. |
| 5 | GND | Pi GND. |
| 6 | NC | Leave open. |

Use a BSS138-style 4-channel bidirectional shifter. LV is the Pi's 3.3 V pin. HV is Game Boy pin 1, used only as the high-side reference. Common ground is required. Do not power the Pi from the Game Boy.

If the first bytes look inverted, set `LINK_CLK_IDLE=low` and restart. Default is idle-high: data is set up before the falling edge, the Pi samples SO while the clock is low, and the rising edge is when the DMG samples SI. MSB first.

`LINK_HALF_PERIOD_US` (default 200) and `LINK_GAP_US` (default 1500) slow the bus down if bytes corrupt.

## Bytes

Every exchange is full duplex. The byte the Game Boy shifts out during a clocked byte was preloaded on the previous byte, so a poll is three bytes and the event is read from any of them.

Poll, Pi to Game Boy: `A5 5A 00`

Packet: `AA CMD LEN_HI LEN_LO DATA CHK`

`CHK` is the XOR of `CMD`, both length bytes, and every data byte.

| CMD | Name | Meaning |
| --- | --- | --- |
| `01` | HELLO | Link is up. |
| `02` | SHOW | One dex entry. |
| `04` | IDLE | Dex is empty. |
| `10` | ACK | Clears the latched button. |
| `7E` | PING | Keepalive. |

SHOW data, then Pascal strings (`u8` length + ASCII, newline is `0A`):

`id_hi id_lo index total flags` then name (20), category (22), types (18), title (20), company (20), flavor (96), area (32), draft (120).

Flags: bit 0 caught, bit 1 draft waiting, bit 2 has a name.

Game Boy to Pi, latched until ACK:

| Byte | Button |
| --- | --- |
| `41` | A, approve the open follow-up |
| `42` | B, skip |
| `4C` | Left, previous entry |
| `52` | Right, next entry |
| `55` | Up, scroll (handled on the Game Boy; Pi only ACKs) |
| `44` | Down, scroll |
| `15` | NAK, last packet failed |

The Pi approves or skips the entry it last showed. A and B are edge-triggered and sticky until ACK so a slow poll cannot miss them, and they cannot fire twice.
