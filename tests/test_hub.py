import io

from fastapi.testclient import TestClient
from PIL import Image

from pi_server.app import create_app
from pi_server.images import dither_sprite
from pi_server.model import get_contact
from pi_server.protocol import EVT_A, EVT_RIGHT, GbSlaveSim, contact_entry, encode_show
from pi_server.link import LinkSession
from pi_server.store import MemoryBackend, Store


def _client():
    store = Store(MemoryBackend())
    return TestClient(create_app(store)), store


def test_seed_counts_and_pages():
    client, _store = _client()
    health = client.get("/api/health")
    assert health.status_code == 200
    body = health.json()
    assert body["seen"] == 3
    assert body["caught"] == 1
    assert client.get("/").status_code == 200
    scan = client.get("/scan")
    assert scan.status_code == 200
    assert 'capture="environment"' in scan.text
    assert "agree" in scan.text.lower()
    page = client.get("/").text
    assert "Seen" in page


def test_scan_profile_queue_and_catch():
    client, store = _client()
    denied = client.post("/api/scans", json={"consent": False, "name": "No"})
    assert denied.status_code == 400

    created = client.post("/api/scans", json={
        "consent": True,
        "url": "https://www.linkedin.com/in/luis-ortega-demo",
        "name": "",
        "company": "",
    })
    assert created.status_code == 200
    entry = created.json()
    assert entry["number"] == "004"
    assert entry["status"] == "seen"
    assert entry["profile_url"].startswith("https://www.linkedin.com/")
    assert entry["sprite_url"].startswith("data:image/png")

    bad_types = client.post(f"/api/contacts/{entry['id']}/profile", json={
        "types": ["AI", "Hardware", "Press"],
    })
    assert bad_types.status_code == 400

    profiled = client.post(f"/api/contacts/{entry['id']}/profile", json={
        "name": "Luis Ortega",
        "category": "the Partner Pokémon",
        "types": ["Partnerships", "Ag"],
        "title": "Partnerships",
        "company": "Northwind Ag",
        "flavor_text": "Spring kits could bundle a station.",
        "email": "luis@northwindag.com",
    }).json()
    assert profiled["category"] == "the Partner Pokémon"
    assert profiled["types"] == ["Partnerships", "Ag"]
    assert profiled["flavor_text"].startswith("Spring")

    queued = client.post("/api/items", json={
        "to": "luis@northwindag.com",
        "subject": "Spring kits",
        "body": "Hi Luis,\n\nSending the one-pager.\n\nMara",
        "contact_id": entry["id"],
    }).json()
    assert queued["status"] == "pending"

    decision = client.get(f"/api/items/{queued['id']}").json()
    assert decision["status"] == "pending"

    caught = client.post(f"/api/contacts/{entry['id']}/approve").json()
    assert caught["status"] == "caught"
    assert client.get("/api/stats").json()["caught"] == 2
    assert client.get("/api/stats").json()["seen"] == 4
    assert client.get(f"/api/items/{queued['id']}").json()["status"] == "approved"

    skipped = client.post("/api/contacts/3/skip").json()
    assert skipped["status"] == "seen"
    assert skipped["followup_status"] == "skipped"
    assert store.read(get_contact, 1)["status"] == "caught"


def test_mcp_tools_roundtrip():
    client, _store = _client()
    init = client.post("/mcp", json={
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "test", "version": "0"}},
    })
    assert init.status_code == 200
    assert init.json()["result"]["serverInfo"]["name"] == "pokedex-for-people"
    names = [
        tool["name"]
        for tool in client.post("/mcp", json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"}).json()["result"]["tools"]
    ]
    for required in ("scan_person", "capture_badge", "list_contacts", "attach_profile", "queue_for_approval", "get_decision"):
        assert required in names

    scanned = client.post("/mcp", json={
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {"name": "scan_person", "arguments": {
            "consent": True,
            "url": "https://www.linkedin.com/in/samira-qureshi-demo",
            "name": "Samira",
            "company": "Dry Creek Review",
        }},
    }).json()["result"]
    assert scanned["isError"] is False
    assert "004" in scanned["content"][0]["text"]

    listed = client.post("/mcp", json={
        "jsonrpc": "2.0",
        "id": 4,
        "method": "tools/call",
        "params": {"name": "list_contacts", "arguments": {"sort": "number"}},
    }).json()["result"]["content"][0]["text"]
    assert '"seen": 4' in listed

    attached = client.post("/mcp", json={
        "jsonrpc": "2.0",
        "id": 5,
        "method": "tools/call",
        "params": {"name": "attach_profile", "arguments": {
            "id": 4,
            "category": "the Editor Pokémon",
            "types": ["Press"],
            "flavor_text": "Asked for a photo of the dex.",
        }},
    }).json()
    assert attached["result"]["isError"] is False

    queued = client.post("/mcp", json={
        "jsonrpc": "2.0",
        "id": 6,
        "method": "tools/call",
        "params": {"name": "queue_for_approval", "arguments": {
            "to": "samira@drycreek.review",
            "subject": "Photo",
            "body": "Sending the photo.",
            "contact_id": 4,
        }},
    }).json()
    assert '"status": "pending"' in queued["result"]["content"][0]["text"]

    decision = client.post("/mcp", json={
        "jsonrpc": "2.0",
        "id": 7,
        "method": "tools/call",
        "params": {"name": "get_decision", "arguments": {"id": 2}},
    }).json()
    assert decision["result"]["isError"] is False


def test_committed_rom_has_a_valid_header():
    from pathlib import Path

    rom = (Path(__file__).resolve().parents[1] / "gameboy" / "approval.gb").read_bytes()
    checksum = 0
    for index in range(0x134, 0x14D):
        checksum = (checksum - rom[index] - 1) & 0xFF
    assert checksum == rom[0x14D]


def test_sprite_is_game_boy_sized():
    image = Image.new("RGB", (30, 40), (180, 180, 180))
    png = dither_sprite(image)
    opened = Image.open(io.BytesIO(png))
    assert opened.size == (160, 144)


def test_link_session_approves_the_open_entry():
    store = Store(MemoryBackend())
    sim = GbSlaveSim()
    link = LinkSession(sim, store)
    link.start()
    assert "Priya" in sim.fields["name"]
    sim.press(EVT_RIGHT)
    seen = store.read(get_contact, 2)
    for _ in range(8):
        link.tick()
        if sim.dex_id == 2 and "Jonah" in sim.fields.get("name", ""):
            break
    assert sim.dex_id == 2
    sim.press(EVT_A)
    for _ in range(8):
        link.tick()
        seen = store.read(get_contact, 2)
        if seen["status"] == "caught":
            break
    assert seen["status"] == "caught"
    packet = encode_show(contact_entry(seen, 2, 3))
    assert packet[0] == 0xAA


def test_sample_scan_and_standin_research():
    client, _store = _client()
    missing = client.post("/api/scans/sample", json={"who": "luis", "consent": False})
    assert missing.status_code == 400
    created = client.post("/api/scans/sample", json={"who": "luis", "consent": True}).json()
    assert created["number"] == "004"
    assert created["profile_source"] == "linkedin"
    researched = client.post(f"/api/contacts/{created['id']}/research").json()
    assert researched["name"] == "Luis Ortega"
    assert researched["followup"]["status"] == "pending"
    assert researched["category"] == "the Partner Pokémon"
