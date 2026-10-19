"""Sample MCP session a Grok Bot connector performs.

    python examples/mcp_demo.py --url http://127.0.0.1:8741/mcp
"""

from __future__ import annotations

import argparse
import json
import urllib.request


def post(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8")
    if not body.strip():
        return {}
    if body.startswith("event:"):
        for line in body.splitlines():
            if line.startswith("data:"):
                return json.loads(line[5:].strip())
    return json.loads(body)


def tool(url: str, name: str, arguments: dict, msg_id: int) -> dict:
    message = post(url, {
        "jsonrpc": "2.0",
        "id": msg_id,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments},
    })
    text = message["result"]["content"][0]["text"]
    print(f"\n# {name}\n{text}")
    return json.loads(text)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8741/mcp")
    args = parser.parse_args()
    post(args.url, {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "mcp-demo", "version": "0.1.0"},
        },
    })
    post(args.url, {"jsonrpc": "2.0", "method": "notifications/initialized"})
    scanned = tool(args.url, "scan_person", {
        "consent": True,
        "url": "https://www.linkedin.com/in/luis-ortega-demo",
        "name": "Luis Ortega",
        "company": "Northwind Ag",
    }, 2)
    tool(args.url, "attach_profile", {
        "id": scanned["id"],
        "name": "Luis Ortega",
        "category": "the Partner Pokémon",
        "types": ["Partnerships", "Ag"],
        "title": "Partnerships",
        "company": "Northwind Ag",
        "flavor_text": "Partnerships at Northwind Ag. Spring kits could bundle a station.",
        "email": "luis@northwindag.com",
        "profile_url": scanned["url"],
    }, 3)
    queued = tool(args.url, "queue_for_approval", {
        "to": "luis@northwindag.com",
        "subject": "Spring kits and a field station",
        "body": "Hi Luis,\n\nGood to meet you tonight. I'll send the one-pager tomorrow.\n\nMara Chen\nLumen Field Co.",
        "contact_id": scanned["id"],
    }, 4)
    tool(args.url, "get_decision", {"id": queued["id"]}, 5)


if __name__ == "__main__":
    main()
