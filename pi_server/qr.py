"""Decode a QR code from image bytes.

Order: pyzbar, then OpenCV's QRCodeDetector. Both are optional so the
Vercel demo still boots when the system libraries are missing. The phone
page also decodes in the browser and sends the URL.
"""

from __future__ import annotations

import io
import logging

log = logging.getLogger("pokedex.qr")


def classify_url(url: str) -> str:
    lowered = (url or "").lower()
    if "linkedin.com" in lowered:
        return "linkedin"
    if "x.com/" in lowered or "twitter.com/" in lowered:
        return "x"
    if "lu.ma" in lowered or "luma.com" in lowered:
        return "luma"
    if lowered.startswith("http://") or lowered.startswith("https://"):
        return "url"
    return ""


def decode_qr(data: bytes | None) -> str | None:
    if not data:
        return None
    text = _pyzbar(data)
    if text:
        return text
    return _opencv(data)


def _pyzbar(data: bytes) -> str | None:
    try:
        from PIL import Image
        from pyzbar.pyzbar import decode
    except Exception:
        return None
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
        codes = decode(image)
    except Exception:
        log.debug("pyzbar failed", exc_info=True)
        return None
    if not codes:
        return None
    raw = codes[0].data
    return raw.decode("utf-8", "replace").strip() or None


def _opencv(data: bytes) -> str | None:
    try:
        import cv2
        import numpy as np
    except Exception:
        return None
    try:
        arr = np.frombuffer(data, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if image is None:
            return None
        detector = cv2.QRCodeDetector()
        text, _points, _ = detector.detectAndDecode(image)
    except Exception:
        log.debug("opencv qr failed", exc_info=True)
        return None
    text = (text or "").strip()
    return text or None
