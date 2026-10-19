"""Camera capture on the Pi. Phone upload is handled by the hub, not here.

Priority: picamera2, then a USB webcam through OpenCV. If neither opens,
the caller should send the person to /scan on their phone.
"""

from __future__ import annotations

import os
import time


class CameraError(RuntimeError):
    pass


def capture_frame() -> tuple[bytes, str]:
    errors = []
    try:
        return _picamera2(), "picamera2"
    except Exception as exc:
        errors.append(f"picamera2: {exc}")
    try:
        return _opencv(), "opencv"
    except Exception as exc:
        errors.append(f"webcam: {exc}")
    detail = "; ".join(errors)
    raise CameraError(
        "No Pi camera or USB webcam. Open /scan on a phone and photograph the QR there. " + detail
    )


def _picamera2() -> bytes:
    from picamera2 import Picamera2

    camera = Picamera2()
    try:
        config = camera.create_still_configuration(main={"size": (1280, 720), "format": "RGB888"})
        camera.configure(config)
        camera.start()
        time.sleep(0.4)
        array = camera.capture_array()
    finally:
        try:
            camera.stop()
        except Exception:
            pass
        camera.close()
    from PIL import Image

    image = Image.fromarray(array)
    import io

    buf = io.BytesIO()
    image.convert("RGB").save(buf, format="JPEG", quality=80)
    return buf.getvalue()


def _opencv() -> bytes:
    import cv2

    index = int(os.environ.get("CAMERA_INDEX", "0"))
    cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        raise CameraError(f"could not open camera index {index}")
    try:
        ok, frame = cap.read()
    finally:
        cap.release()
    if not ok or frame is None:
        raise CameraError("webcam returned no frame")
    ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    if not ok:
        raise CameraError("could not encode webcam frame")
    return encoded.tobytes()
