"""python -m pi_server --mock   or   python -m pi_server --bridge --hub URL"""

from __future__ import annotations

import argparse
import base64
import logging
import os
import threading

import uvicorn

from pi_server.app import create_app
from pi_server.capture import CameraError, capture_frame
from pi_server.hubclient import HubClient
from pi_server.link import run_link_forever
from pi_server.store import make_store


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="pi_server", description="Pokédex for people")
    parser.add_argument("--mock", action="store_true", help="All-in-one hub on this machine. No GPIO.")
    parser.add_argument("--bridge", action="store_true", help="Pi client: link cable + optional camera, state lives at HUB_URL.")
    parser.add_argument("--capture", action="store_true", help="Take one photo and scan it (Pi camera, else webcam).")
    parser.add_argument("--hub", default=os.environ.get("HUB_URL", ""), help="Hub base URL. Env: HUB_URL.")
    parser.add_argument("--consent", action="store_true", help="Required with --capture. Only after the person agrees.")
    parser.add_argument("--name", default="")
    parser.add_argument("--company", default="")
    parser.add_argument("--url", default="", help="QR URL if you already decoded it.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8741)
    parser.add_argument("--link", action="store_true", help="With --mock, also try the link cable.")
    parser.add_argument("--reset", action="store_true", help="Reseed the local database before serving.")
    args = parser.parse_args(argv)

    if args.capture:
        _capture_once(args)
        return
    if args.bridge and not args.mock:
        _run_bridge(args)
        return

    if args.mock:
        os.environ.pop("VERCEL", None)
    store = make_store()
    if args.reset:
        store.reset()
        logging.info("reseeded demo dex")
    app = create_app(store)
    if args.link and not args.mock:
        stop = threading.Event()
        threading.Thread(target=run_link_forever, args=(store, stop), daemon=True).start()
    elif args.link and args.mock:
        logging.info("--mock ignores the link cable; use the browser dex")
    logging.info("dex at http://%s:%s  scan at http://%s:%s/scan  mcp at /mcp", args.host, args.port, args.host, args.port)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


def _capture_once(args) -> None:
    if not args.consent:
        raise SystemExit("Refusing to photograph anyone without --consent. Ask them first.")
    try:
        photo, source = capture_frame()
    except CameraError as exc:
        raise SystemExit(str(exc)) from exc
    hub = (args.hub or "http://127.0.0.1:8741").rstrip("/")
    client = HubClient(hub)
    result = client.scan({
        "consent": True,
        "name": args.name,
        "company": args.company,
        "url": args.url,
        "photo_base64": base64.b64encode(photo).decode("ascii"),
    })
    logging.info("captured via %s -> dex #%s", source, result.get("number"))
    print(json_dumps(result))


def _run_bridge(args) -> None:
    if not args.hub:
        raise SystemExit("Set HUB_URL or pass --hub https://your-dex.vercel.app")
    client = HubClient(args.hub)
    logging.info("bridge -> %s", client.base)
    stop = threading.Event()
    try:
        run_link_forever(client, stop)
    except KeyboardInterrupt:
        stop.set()


def json_dumps(payload: dict) -> str:
    import json

    return json.dumps({
        "number": payload.get("number"),
        "id": payload.get("id"),
        "url": payload.get("profile_url") or payload.get("url"),
        "name": payload.get("name"),
        "status": payload.get("status"),
    }, indent=2)


if __name__ == "__main__":
    main()
