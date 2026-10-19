const form = document.getElementById("scan-form");
const consent = document.getElementById("consent");
const qrInput = document.getElementById("qr");
const photoInput = document.getElementById("photo");
const urlInput = document.getElementById("url");
const nameInput = document.getElementById("name");
const companyInput = document.getElementById("company");
const qrResult = document.getElementById("qr-result");
const preview = document.getElementById("photo-preview");
const errorBox = document.getElementById("form-error");
const resultBox = document.getElementById("result");

qrInput.addEventListener("change", async () => {
  const file = qrInput.files && qrInput.files[0];
  if (!file) return;
  qrResult.textContent = "Reading QR…";
  try {
    const decoded = await decodeQr(file);
    if (decoded) {
      urlInput.value = decoded;
      qrResult.textContent = `Decoded: ${decoded}`;
    } else {
      qrResult.textContent = "No QR found in that photo. Type the name, or try again closer.";
    }
  } catch (error) {
    qrResult.textContent = "Could not read that photo. Type a name and company instead.";
  }
});

photoInput.addEventListener("change", () => {
  const file = photoInput.files && photoInput.files[0];
  if (!file) return;
  preview.hidden = false;
  preview.src = URL.createObjectURL(file);
  preview.alt = "Photo that will become the sprite";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.textContent = "";
  if (!consent.checked) {
    errorBox.textContent = "Check the consent box. We only scan people who agree.";
    return;
  }
  const body = new FormData();
  body.set("consent", "yes");
  body.set("url", urlInput.value.trim());
  body.set("name", nameInput.value.trim());
  body.set("company", companyInput.value.trim());
  if (qrInput.files[0]) body.set("qr_image", await shrink(qrInput.files[0]), "qr.jpg");
  if (photoInput.files[0]) body.set("photo", await shrink(photoInput.files[0]), "photo.jpg");
  await send(body);
});

document.querySelectorAll("[data-sample]").forEach((button) => {
  button.addEventListener("click", async () => {
    errorBox.textContent = "";
    if (!consent.checked) {
      errorBox.textContent = "Check the consent box first, even for a sample.";
      return;
    }
    const response = await fetch("/api/scans/sample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ who: button.dataset.sample, consent: true }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      errorBox.textContent = payload.message || "Sample scan failed.";
      return;
    }
    showResult(payload);
  });
});

async function send(body) {
  const response = await fetch("/api/scans", { method: "POST", body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    errorBox.textContent = payload.message || "Could not add them.";
    return;
  }
  showResult(payload);
}

function showResult(contact) {
  resultBox.hidden = false;
  const who = contact.name || contact.url || contact.profile_url || "Unread";
  resultBox.innerHTML = `
    <h2>Seen #${contact.number}</h2>
    <p>${escapeHtml(who)} is on the dex. Grok Bot can research the URL and attach a profile.</p>
    <p><a href="/?entry=${contact.id}">Open #${contact.number} on the dex</a></p>
  `;
  resultBox.scrollIntoView({ behavior: "smooth" });
}

async function decodeQr(file) {
  const bitmap = await createImageBitmap(file);
  if ("BarcodeDetector" in window) {
    try {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const codes = await detector.detect(bitmap);
      if (codes[0] && codes[0].rawValue) return codes[0].rawValue;
    } catch (error) {
      /* fall through to jsQR */
    }
  }
  const maxEdge = 900;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  if (typeof jsQR !== "function") return "";
  const code = jsQR(image.data, canvas.width, canvas.height);
  return code ? code.data : "";
}

async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1000;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
  return new File([blob], "capture.jpg", { type: "image/jpeg" });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}
