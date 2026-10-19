"""Dither a consented photo into a 160x144 four-green sprite.

The whole frame is reduced. Nothing here detects or recognizes a face.
"""

from __future__ import annotations

import base64
import io
import logging

from PIL import Image, ImageDraw, ImageOps

log = logging.getLogger("pokedex.images")

WIDTH = 160
HEIGHT = 144
# Classic DMG greens, darkest to lightest.
GREENS = (
    (15, 56, 15),
    (48, 98, 48),
    (139, 172, 15),
    (155, 188, 15),
)
# 4x4 Bayer matrix, values 0..15.
BAYER = (
    (0, 8, 2, 10),
    (12, 4, 14, 6),
    (3, 11, 1, 9),
    (15, 7, 13, 5),
)


def dither_sprite(image: Image.Image) -> bytes:
    """Fit any photo to the Game Boy screen and posterize it to four greens."""
    fitted = ImageOps.fit(image.convert("RGB"), (WIDTH, HEIGHT), method=Image.Resampling.BOX)
    fitted = ImageOps.autocontrast(fitted)
    gray = fitted.convert("L")
    src = gray.load()
    out = Image.new("RGB", (WIDTH, HEIGHT))
    pix = out.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            g = src[x, y] / 255.0
            threshold = (BAYER[y & 3][x & 3] / 16.0 - 0.5) * 0.85
            level = int((g + threshold) * 4)
            if level < 0:
                level = 0
            elif level > 3:
                level = 3
            pix[x, y] = GREENS[level]
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def sprite_from_bytes(data: bytes) -> bytes:
    image = Image.open(io.BytesIO(data))
    image = ImageOps.exif_transpose(image)
    return dither_sprite(image)


def shrink_photo(data: bytes, max_edge: int = 800) -> bytes:
    """Keep a small JPEG of the original photo for the bot. Not a face crop."""
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    image.thumbnail((max_edge, max_edge))
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=72, optimize=True)
    return buf.getvalue()


def monogram_sprite(name: str, salt: int = 0) -> bytes:
    """Stand-in sprite for seeded demo entries that have no photo yet."""
    label = "".join(part[0] for part in (name or "?").split() if part)[:2].upper() or "?"
    shade = 40 + (salt * 37) % 160
    canvas = Image.new("RGB", (WIDTH, HEIGHT), (shade, shade, shade))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((8, 8, WIDTH - 9, HEIGHT - 9), outline=(20, 20, 20), width=4)
    draw.rectangle((24, 78, WIDTH - 25, HEIGHT - 18), fill=(max(0, shade - 50),) * 3)
    draw.ellipse((56, 22, 104, 70), fill=(min(255, shade + 40),) * 3)
    bbox = draw.textbbox((0, 0), label)
    text_w = bbox[2] - bbox[0]
    draw.text(((WIDTH - text_w) / 2, 34), label, fill=(10, 10, 10))
    return dither_sprite(canvas)


def data_url(data: bytes, mime: str) -> str:
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def store_image(data: bytes, mime: str, pathname: str) -> str:
    """Upload to Vercel Blob when a token is set. Otherwise return a data URL."""
    import os

    token = os.environ.get("BLOB_READ_WRITE_TOKEN", "").strip()
    if token:
        try:
            return _put_blob(pathname, data, mime, token)
        except Exception:
            log.exception("blob upload failed; using an inline data URL")
    return data_url(data, mime)


def _put_blob(pathname: str, data: bytes, mime: str, token: str) -> str:
    import json
    import urllib.error
    import urllib.parse
    import urllib.request

    query = urllib.parse.urlencode({"pathname": pathname})
    url = f"https://vercel.com/api/blob/?{query}"
    req = urllib.request.Request(
        url,
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "x-api-version": "7",
            "x-content-type": mime,
            "x-vercel-blob-access": "public",
            "x-add-random-suffix": "1",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"blob HTTP {exc.code}: {detail}") from exc
    public = body.get("url")
    if not public:
        raise RuntimeError("blob response had no url")
    return public
