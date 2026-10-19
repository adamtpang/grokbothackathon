/* Pokédex for people — DMG ROM.
   External clock. Pi is master. Packet layout: gameboy/PROTOCOL.md */
#include <gb/gb.h>
#include <gb/isr.h>
#include <gbdk/console.h>
#include <gbdk/font.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define RX_SIZE 512
#define RX_MASK 511
#define PKT_MAX 400

#define SYNC 0xAAu
#define POLL_A 0xA5u
#define CMD_SHOW 0x02u
#define CMD_IDLE 0x04u
#define CMD_ACK 0x10u
#define EVT_A 0x41u
#define EVT_B 0x42u
#define EVT_UP 0x55u
#define EVT_DOWN 0x44u
#define EVT_LEFT 0x4Cu
#define EVT_RIGHT 0x52u
#define EVT_NAK 0x15u

static uint8_t rx_buf[RX_SIZE];
static volatile uint16_t rx_head;
static volatile uint16_t rx_tail;
static volatile uint8_t tx_latch;
static volatile uint8_t rx_overflow;

static uint8_t event_latched;
static uint8_t nak_flag;
static uint8_t parse_state;
static uint8_t cmd;
static uint16_t pkt_len;
static uint16_t pkt_got;
static uint8_t pkt[PKT_MAX];
static uint8_t running_xor;
static uint8_t prev_joy;
static uint8_t scroll;
static uint8_t dirty;
static uint8_t have_entry;
static uint8_t screen; /* 0 detail, 1 draft */

static uint16_t dex_id;
static uint8_t dex_index;
static uint8_t dex_total;
static uint8_t dex_flags;
static char f_name[21];
static char f_category[23];
static char f_types[19];
static char f_title[21];
static char f_company[21];
static char f_flavor[97];
static char f_area[33];
static char f_draft[121];
static char line[21];

static void sync_tx(void) {
    if (event_latched) tx_latch = event_latched;
    else if (nak_flag) tx_latch = EVT_NAK;
    else tx_latch = 0;
}

static void arm(void) {
    SB_REG = tx_latch;
    SC_REG = SIOF_XFER_START;
}

void sio_isr(void) __critical __interrupt {
    uint8_t received = SB_REG;
    uint16_t next = (rx_head + 1u) & RX_MASK;
    if (next != rx_tail) {
        rx_buf[rx_head] = received;
        rx_head = next;
    } else {
        rx_overflow = 1;
    }
    SB_REG = tx_latch;
    SC_REG = SIOF_XFER_START;
}
ISR_VECTOR(VECTOR_SERIAL, sio_isr)

static uint8_t pop(uint8_t *out) {
    uint16_t head;
    __critical { head = rx_head; }
    if (head == rx_tail) return 0;
    *out = rx_buf[rx_tail];
    rx_tail = (rx_tail + 1u) & RX_MASK;
    return 1;
}

static void copy_text(char *dest, uint8_t cap, const uint8_t *src, uint8_t n) {
    uint8_t i;
    if (n > cap) n = cap;
    for (i = 0; i < n; i++) dest[i] = (char)src[i];
    dest[n] = 0;
}

static uint8_t read_pascal(uint16_t *i, char *dest, uint8_t cap) {
    uint8_t n;
    if (*i >= pkt_len) return 0;
    n = pkt[*i];
    *i += 1;
    if ((uint16_t)(*i + n) > pkt_len) return 0;
    copy_text(dest, cap, pkt + *i, n);
    *i += n;
    return 1;
}

static void apply_show(void) {
    uint16_t i = 5;
    if (pkt_len < 5) {
        nak_flag = 1;
        return;
    }
    dex_id = ((uint16_t)pkt[0] << 8) | pkt[1];
    dex_index = pkt[2];
    dex_total = pkt[3];
    dex_flags = pkt[4];
    if (!read_pascal(&i, f_name, 20)) { nak_flag = 1; return; }
    if (!read_pascal(&i, f_category, 22)) { nak_flag = 1; return; }
    if (!read_pascal(&i, f_types, 18)) { nak_flag = 1; return; }
    if (!read_pascal(&i, f_title, 20)) { nak_flag = 1; return; }
    if (!read_pascal(&i, f_company, 20)) { nak_flag = 1; return; }
    if (!read_pascal(&i, f_flavor, 96)) { nak_flag = 1; return; }
    if (!read_pascal(&i, f_area, 32)) { nak_flag = 1; return; }
    if (!read_pascal(&i, f_draft, 120)) { nak_flag = 1; return; }
    nak_flag = 0;
    have_entry = 1;
    scroll = 0;
    screen = 0;
    dirty = 1;
}

static void consume(uint8_t byte) {
    if (parse_state == 0) {
        if (byte == POLL_A) parse_state = 1;
        else if (byte == SYNC) parse_state = 2;
        return;
    }
    if (parse_state == 1) {
        parse_state = 0;
        return;
    }
    if (parse_state == 2) {
        cmd = byte;
        running_xor = byte;
        parse_state = 3;
        return;
    }
    if (parse_state == 3) {
        pkt_len = (uint16_t)byte << 8;
        running_xor ^= byte;
        parse_state = 4;
        return;
    }
    if (parse_state == 4) {
        pkt_len |= byte;
        running_xor ^= byte;
        pkt_got = 0;
        parse_state = pkt_len == 0 ? 6 : (pkt_len > PKT_MAX ? 7 : 5);
        return;
    }
    if (parse_state == 5 || parse_state == 7) {
        if (parse_state == 5 && pkt_got < PKT_MAX) pkt[pkt_got] = byte;
        running_xor ^= byte;
        pkt_got++;
        if (pkt_got >= pkt_len) parse_state = 6;
        return;
    }
    if (parse_state == 6) {
        parse_state = 0;
        if (byte != running_xor || pkt_len > PKT_MAX) {
            nak_flag = 1;
            sync_tx();
            return;
        }
        nak_flag = 0;
        if (cmd == CMD_ACK) event_latched = 0;
        else if (cmd == CMD_IDLE) { have_entry = 0; dirty = 1; }
        else if (cmd == CMD_SHOW) apply_show();
        sync_tx();
    }
}

static void latch(uint8_t ev) {
    if (event_latched) return;
    event_latched = ev;
    sync_tx();
}

static void buttons(void) {
    uint8_t joy = joypad();
    uint8_t pressed = joy & (uint8_t)(~prev_joy);
    prev_joy = joy;
    if (pressed & J_UP) {
        if (scroll > 0) scroll--;
        latch(EVT_UP);
        dirty = 1;
    } else if (pressed & J_DOWN) {
        scroll++;
        latch(EVT_DOWN);
        dirty = 1;
    } else if (pressed & J_LEFT) latch(EVT_LEFT);
    else if (pressed & J_RIGHT) latch(EVT_RIGHT);
    else if (pressed & J_A) {
        if (have_entry && screen == 0 && (dex_flags & 0x02u)) {
            screen = 1;
            scroll = 0;
            dirty = 1;
        } else latch(EVT_A);
    } else if (pressed & J_B) {
        if (screen == 1) latch(EVT_B);
    }
}

static void put_line(uint8_t y, const char *text) {
    uint8_t i = 0;
    gotoxy(0, y);
    while (text[i] && i < 20) {
        setchar(text[i]);
        i++;
    }
    while (i < 20) {
        setchar(' ');
        i++;
    }
}

static void slice_line(const char *text, uint8_t which, char *out) {
    uint8_t line_i = 0;
    uint8_t col = 0;
    uint8_t i = 0;
    out[0] = 0;
    while (text[i]) {
        if (text[i] == '\n' || col == 20) {
            if (line_i == which) { out[col] = 0; return; }
            line_i++;
            col = 0;
            if (text[i] == '\n') { i++; continue; }
        }
        if (line_i == which && col < 20) out[col++] = text[i];
        i++;
    }
    if (line_i == which) out[col] = 0;
}

static void draw(void) {
    uint8_t row;
    cls();
    if (!have_entry) {
        put_line(1, "POKEDEX");
        put_line(2, "FOR PEOPLE");
        put_line(5, "Waiting for");
        put_line(6, "the Pi link.");
        put_line(8, "Ask before");
        put_line(9, "you scan.");
        put_line(16, "A SEND");
        put_line(17, "B SKIP");
        dirty = 0;
        return;
    }
    if (screen == 0) {
        sprintf(line, "#%u %u/%u", (unsigned)dex_id, (unsigned)dex_index, (unsigned)dex_total);
        put_line(0, line);
        put_line(1, (dex_flags & 0x01u) ? "CAUGHT" : "SEEN");
        put_line(2, f_name);
        put_line(3, f_category);
        put_line(4, f_types);
        put_line(5, f_company);
        put_line(6, "--------------------");
        for (row = 0; row < 6; row++) {
            slice_line(f_flavor, (uint8_t)(scroll + row), line);
            put_line((uint8_t)(7 + row), line);
        }
        put_line(13, "--------------------");
        put_line(14, f_area);
        put_line(15, f_title);
        put_line(16, (dex_flags & 0x02u) ? "A DRAFT" : "A .....");
        put_line(17, "B .....");
    } else {
        put_line(0, "FOLLOW-UP");
        put_line(1, f_name);
        put_line(2, "--------------------");
        for (row = 0; row < 11; row++) {
            slice_line(f_draft, (uint8_t)(scroll + row), line);
            put_line((uint8_t)(3 + row), line);
        }
        put_line(15, "--------------------");
        put_line(16, "A APPROVE");
        put_line(17, "B SKIP");
    }
    dirty = 0;
}

void main(void) {
    font_init();
    font_set(font_load(font_ibm));
    mode(M_NO_SCROLL);
    DISPLAY_ON;
    SHOW_BKG;
    BGP_REG = 0xE4u;
    tx_latch = 0;
    set_interrupts(VBL_IFLAG | SIO_IFLAG);
    enable_interrupts();
    arm();
    dirty = 1;
    while (1) {
        uint8_t byte;
        buttons();
        if (rx_overflow) {
            rx_overflow = 0;
            nak_flag = 1;
            parse_state = 0;
            sync_tx();
        }
        while (pop(&byte)) consume(byte);
        if ((SC_REG & SIOF_XFER_START) == 0) arm();
        if (dirty) draw();
        vsync();
    }
}
