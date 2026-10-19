const rawFont = Uint8Array.from(atob(window.GB_FONT_B64), (c) => c.charCodeAt(0));
const FG = "#0f380f";
const MID = "#306230";
const BG = "#9bbc0f";

const canvas = document.getElementById("lcd");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const state = {
  contacts: [],
  seen: 0,
  caught: 0,
  index: 0,
  screen: "list",
  scroll: 0,
  flash: "",
  online: false,
  log: [],
};

let spriteImage = null;
let spriteKey = "";
const wanted = Number(new URLSearchParams(location.search).get("entry") || 0);

function blit(ch, x, y, color) {
  const code = ch.charCodeAt(0);
  const base = (code >= 0 && code < 128 ? code : 63) * 8;
  ctx.fillStyle = color;
  for (let row = 0; row < 8; row += 1) {
    const bits = rawFont[base + row];
    for (let col = 0; col < 8; col += 1) {
      if (bits & (1 << col)) ctx.fillRect(x + col, y + row, 1, 1);
    }
  }
}

function pad(text, width) {
  const value = (text || "").slice(0, width);
  return value + " ".repeat(Math.max(0, width - value.length));
}

function write(col, row, text, color = FG) {
  let x = col;
  for (const ch of (text || "").slice(0, 20 - col)) {
    blit(ch, x * 8, row * 8, color);
    x += 1;
  }
}

function wrap(text, width) {
  const lines = [];
  let line = "";
  for (const ch of (text || "").replace(/\r/g, "")) {
    if (ch === "\n" || line.length >= width) {
      lines.push(line);
      line = ch === "\n" ? "" : ch;
      continue;
    }
    line += ch;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function clear() {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, 160, 144);
}

function current() {
  return state.contacts[state.index] || null;
}

function draw() {
  clear();
  if (!state.online) {
    write(0, 2, "READING...");
    return;
  }
  if (!state.contacts.length) {
    write(0, 0, "SEEN 00");
    write(0, 1, "CAUGHT 00");
    write(0, 4, "NO ONE YET");
    write(0, 6, "Open /scan on a");
    write(0, 7, "phone. Ask");
    write(0, 8, "before you");
    write(0, 9, "photograph");
    write(0, 10, "anyone.");
    return;
  }
  if (state.screen === "detail") drawDetail(current());
  else if (state.screen === "draft") drawDraft(current());
  else drawList();
  if (state.flash) write(0, 17, pad(state.flash, 20));
  document.getElementById("screen-name").textContent =
    state.screen === "draft" ? "Follow-up" : state.screen === "detail" ? "Entry" : "Dex list";
  ensureSprite(current());
}

function drawList() {
  write(0, 0, pad(`SEEN ${String(state.seen).padStart(2, "0")}`, 20));
  write(0, 1, pad(`CAUGHT ${String(state.caught).padStart(2, "0")}`, 20));
  write(0, 2, "-".repeat(20), MID);
  const windowSize = 12;
  let start = Math.max(0, state.index - windowSize + 1);
  if (state.contacts.length <= windowSize) start = 0;
  for (let i = 0; i < windowSize; i += 1) {
    const contact = state.contacts[start + i];
    const row = 3 + i;
    if (!contact) continue;
    const cursor = start + i === state.index ? ">" : " ";
    const mark = contact.status === "caught" ? "*" : " ";
    const label = (contact.name || "Unread").toUpperCase();
    const line = `${cursor}${mark}${contact.number} ${label}`;
    write(0, row, pad(line, 20), start + i === state.index ? FG : MID);
  }
  write(0, 15, "-".repeat(20), MID);
  write(0, 16, pad("A OPEN", 12) + pad(`${state.index + 1}/${state.contacts.length}`, 8));
}

function drawDetail(contact) {
  if (spriteImage) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spriteImage, 2, 2, 56, 56);
  }
  const bits = (contact.name || "Unread").toUpperCase().split(/\s+/);
  write(8, 0, pad(`#${contact.number}`, 12));
  write(8, 1, pad(contact.status.toUpperCase(), 12));
  write(8, 2, pad(bits[0] || "", 12));
  write(8, 3, pad(bits.slice(1).join(" "), 12));
  write(8, 4, pad((contact.types || []).join("/"), 12));
  write(8, 5, pad(contact.company || "", 12));
  write(0, 7, "-".repeat(20), MID);
  const flavor = contact.category
    ? `${contact.category}. ${contact.flavor_text || ""}`
    : (contact.flavor_text || "Waiting on a profile.");
  const lines = wrap(flavor, 20);
  const maxScroll = Math.max(0, lines.length - 4);
  state.scroll = Math.min(state.scroll, maxScroll);
  for (let i = 0; i < 4; i += 1) write(0, 8 + i, pad(lines[state.scroll + i] || "", 20));
  write(0, 12, "-".repeat(20), MID);
  write(0, 13, pad(contact.area || "", 20));
  write(0, 14, pad(contact.title || "", 20));
  const draft = contact.followup && contact.followup.status === "pending" ? "A DRAFT" : "A .....";
  write(0, 15, pad(draft, 10) + pad("B BACK", 10));
}

function drawDraft(contact) {
  const draft = contact.followup;
  write(0, 0, pad(`FOLLOW-UP #${contact.number}`, 20));
  write(0, 1, pad((contact.name || "Unread").toUpperCase(), 20));
  write(0, 2, "-".repeat(20), MID);
  const body = draft
    ? `To ${draft.to}\n${draft.subject}\n\n${draft.body}`
    : "No draft yet.";
  const lines = wrap(body, 20);
  const maxScroll = Math.max(0, lines.length - 11);
  state.scroll = Math.min(state.scroll, maxScroll);
  for (let i = 0; i < 11; i += 1) write(0, 3 + i, pad(lines[state.scroll + i] || "", 20));
  write(0, 14, "-".repeat(20), MID);
  write(0, 15, "A APPROVE  B SKIP");
}

function ensureSprite(contact) {
  const key = contact && contact.sprite_url;
  if (!key) {
    spriteImage = null;
    spriteKey = "";
    document.getElementById("portrait").removeAttribute("src");
    return;
  }
  if (key === spriteKey) return;
  spriteKey = key;
  const image = new Image();
  image.onload = () => {
    spriteImage = image;
    document.getElementById("portrait").src = key;
    draw();
  };
  image.src = key;
}

function renderSide() {
  document.getElementById("seen-count").textContent = String(state.seen).padStart(2, "0");
  document.getElementById("caught-count").textContent = String(state.caught).padStart(2, "0");
  document.getElementById("link-pill").textContent = state.online ? "Hub linked" : "No link";
  document.getElementById("led").classList.toggle("on", state.online);
  const contact = current();
  const meta = document.getElementById("meta");
  const research = document.getElementById("research");
  if (!contact) {
    meta.innerHTML = "<p>Nobody scanned yet.</p>";
    research.disabled = true;
    return;
  }
  const types = (contact.types || []).map((type) => `<span>${escapeHtml(type)}</span>`).join("");
  meta.innerHTML = `
    <p class="status-pill">${escapeHtml(contact.status)} · #${contact.number}</p>
    <h2>${escapeHtml(contact.name || "Unread")}</h2>
    <p>${escapeHtml(contact.category || "No category yet")}</p>
    <div class="types">${types}</div>
    <p>${escapeHtml(contact.title || "")}${contact.company ? " · " + escapeHtml(contact.company) : ""}</p>
    <p>${escapeHtml(contact.flavor_text || "Waiting for Grok Bot to attach a profile.")}</p>
    <p>${escapeHtml(contact.area || "")}</p>
    ${/^https?:\/\//i.test(contact.profile_url || "") ? `<p><a href="${escapeHtml(contact.profile_url)}">${escapeHtml(contact.profile_url)}</a></p>` : ""}
  `;
  research.disabled = Boolean(contact.flavor_text);
  document.getElementById("portrait-cap").textContent = contact.photo_url
    ? "Sprite from their photo"
    : "Demo monogram sprite";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function note(line) {
  state.log.unshift(line);
  const list = document.getElementById("log");
  list.innerHTML = state.log.slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function flash(text) {
  state.flash = text.slice(0, 20);
  draw();
  setTimeout(() => {
    if (state.flash === text.slice(0, 20)) {
      state.flash = "";
      draw();
    }
  }, 1200);
}

function move(delta) {
  if (!state.contacts.length) return;
  state.index = Math.max(0, Math.min(state.contacts.length - 1, state.index + delta));
  state.scroll = 0;
  if (state.screen === "draft" && !(current().followup && current().followup.status === "pending")) {
    state.screen = "detail";
  }
  draw();
  renderSide();
}

function onA() {
  const contact = current();
  if (!contact) return;
  if (state.screen === "list") {
    state.screen = "detail";
    state.scroll = 0;
    draw();
    return;
  }
  if (state.screen === "detail") {
    if (!contact.followup || contact.followup.status !== "pending") {
      flash("NO DRAFT");
      return;
    }
    state.screen = "draft";
    state.scroll = 0;
    draw();
    return;
  }
  approve();
}

function onB() {
  if (state.screen === "draft") {
    skip();
    return;
  }
  if (state.screen === "detail") {
    state.screen = "list";
    state.scroll = 0;
    draw();
  }
}

function onUp() {
  if (state.screen === "list") move(-1);
  else {
    state.scroll = Math.max(0, state.scroll - 1);
    draw();
  }
}

function onDown() {
  if (state.screen === "list") move(1);
  else {
    state.scroll += 1;
    draw();
  }
}

async function approve() {
  const contact = current();
  const response = await fetch(`/api/contacts/${contact.id}/approve`, { method: "POST" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    flash(body.message || "NO DRAFT");
    return;
  }
  note(`Caught #${contact.number} ${contact.name || ""}`.trim());
  flash("CAUGHT");
  state.screen = "list";
  await refresh();
}

async function skip() {
  const contact = current();
  const response = await fetch(`/api/contacts/${contact.id}/skip`, { method: "POST" });
  if (!response.ok) {
    flash("TRY AGAIN");
    return;
  }
  note(`Skipped #${contact.number} ${contact.name || ""}`.trim());
  flash("SKIPPED");
  state.screen = "list";
  await refresh();
}

async function refresh() {
  try {
    const response = await fetch("/api/contacts?limit=100");
    if (!response.ok) throw new Error("status");
    const data = await response.json();
    const previous = state.contacts[state.index]?.id;
    state.contacts = data.contacts;
    state.seen = data.seen;
    state.caught = data.caught;
    state.online = true;
    if (wanted && !state.openedWanted) {
      const found = state.contacts.findIndex((contact) => contact.id === wanted);
      if (found >= 0) {
        state.index = found;
        state.screen = "detail";
        state.openedWanted = true;
      }
    } else if (previous) {
      const found = state.contacts.findIndex((contact) => contact.id === previous);
      if (found >= 0) state.index = found;
    }
    if (state.index >= state.contacts.length) state.index = Math.max(0, state.contacts.length - 1);
  } catch (error) {
    state.online = false;
    clear();
    write(0, 3, "NO LINK");
    write(0, 5, "The hub is not");
    write(0, 6, "answering.");
    document.getElementById("link-pill").textContent = "No link";
    return;
  }
  draw();
  renderSide();
}

document.getElementById("dpad").addEventListener("click", (event) => {
  const dir = event.target.closest("button")?.dataset.dir;
  if (dir === "up") onUp();
  if (dir === "down") onDown();
  if (dir === "left") move(-1);
  if (dir === "right") move(1);
});
document.getElementById("btn-a").addEventListener("click", onA);
document.getElementById("btn-b").addEventListener("click", onB);

window.addEventListener("keydown", (event) => {
  if (event.target && ["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
  const key = event.key;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(key)) event.preventDefault();
  if (key === "ArrowUp") onUp();
  else if (key === "ArrowDown") onDown();
  else if (key === "ArrowLeft") move(-1);
  else if (key === "ArrowRight") move(1);
  else if ((key === "z" || key === "Z" || key === "a" || key === "A" || key === "Enter") && !event.repeat) onA();
  else if ((key === "x" || key === "X" || key === "b" || key === "B" || key === "Backspace") && !event.repeat) onB();
});

const padMemory = new Map();
function pollPads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad) continue;
    const previous = padMemory.get(pad.index) || { buttons: [], dirs: {} };
    const buttons = pad.buttons.map((button) => button.pressed);
    const dirs = {
      up: buttons[12] || pad.axes[1] < -0.55,
      down: buttons[13] || pad.axes[1] > 0.55,
      left: buttons[14] || pad.axes[0] < -0.55,
      right: buttons[15] || pad.axes[0] > 0.55,
    };
    if (buttons[0] && !previous.buttons[0]) onA();
    if (buttons[1] && !previous.buttons[1]) onB();
    if (dirs.up && !previous.dirs.up) onUp();
    if (dirs.down && !previous.dirs.down) onDown();
    if (dirs.left && !previous.dirs.left) move(-1);
    if (dirs.right && !previous.dirs.right) move(1);
    padMemory.set(pad.index, { buttons, dirs });
  }
  requestAnimationFrame(pollPads);
}
window.addEventListener("gamepadconnected", () => note("Gamepad connected"));
requestAnimationFrame(pollPads);

document.getElementById("research").addEventListener("click", async () => {
  const contact = current();
  if (!contact) return;
  const response = await fetch(`/api/contacts/${contact.id}/research`, { method: "POST" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    flash("NEED GROK");
    note(body.message || "Grok Bot should attach the profile.");
    return;
  }
  note(`Profile attached for #${body.number} ${body.name}`);
  state.screen = "detail";
  await refresh();
});

document.getElementById("reset").addEventListener("click", async () => {
  await fetch("/api/demo/reset", { method: "POST" });
  state.screen = "list";
  state.index = 0;
  note("Demo dex reseeded");
  await refresh();
});

refresh();
setInterval(refresh, 2000);
