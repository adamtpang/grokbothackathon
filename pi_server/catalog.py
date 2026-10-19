"""Fictional people used to seed the dex and the offline research stand-in.

These are not real attendees. The stand-in only fills a profile when the
scanned URL is one of these demo links. A live Grok Bot does the real
research through attach_profile.
"""

from __future__ import annotations

EVENT = "Grok Bot Hackathon, Austin"

SENDER = "Mara Chen\nLumen Field Co."


def _letter(greeting: str, body: str) -> str:
    return f"{greeting}\n\n{body}\n\n{SENDER}"


SEED = [
    {
        "name": "Priya Raman",
        "category": "the Hardware Pokémon",
        "types": ["Hardware", "Field"],
        "title": "Hardware engineer",
        "company": "Fieldnote Labs",
        "flavor_text": "Builds link-cable gadgets and wants this dex on a real DMG.",
        "email": "priya@fieldnote.labs",
        "profile_url": "https://www.linkedin.com/in/priya-raman-demo",
        "minutes_ago": 80,
        "caught": True,
        "subject": "The link-cable dex, as promised",
        "body": _letter(
            "Hi Priya,",
            "Good to meet you at the hackathon. I'll bring a DMG and the link cable "
            "to the booth so you can see the dex on real hardware.",
        ),
    },
    {
        "name": "Jonah Ellis",
        "category": "the Buyer Pokémon",
        "types": ["Education"],
        "title": "Program buyer",
        "company": "Hill Country Schools",
        "flavor_text": "Buys classroom kits. Asked what one station actually costs.",
        "email": "jonah@hillcountry.schools",
        "profile_url": "https://www.linkedin.com/in/jonah-ellis-demo",
        "minutes_ago": 45,
        "caught": False,
        "subject": "Classroom kits, the short version",
        "body": _letter(
            "Hi Jonah,",
            "You asked what a station costs for a classroom. One kit is $240, and "
            "three classrooms would be $680 with the shared charger. I can hold that "
            "price through Friday.",
        ),
    },
    {
        "name": "Adaeze Okonkwo",
        "category": "the Host Pokémon",
        "types": ["Community"],
        "title": "Organizer",
        "company": "Rio Grande Coop",
        "flavor_text": "Runs Austin maker night and offered the dex a table.",
        "email": "adaeze@riogrande.coop",
        "profile_url": "https://lu.ma/user/adaeze-okonkwo-demo",
        "minutes_ago": 20,
        "caught": False,
        "subject": "",
        "body": "",
    },
]

# Scanned live during the demo. Not in the dex until someone scans them.
SAMPLES = {
    "luis": {
        "name": "Luis Ortega",
        "category": "the Partner Pokémon",
        "types": ["Partnerships", "Ag"],
        "title": "Partnerships",
        "company": "Northwind Ag",
        "flavor_text": "Partnerships at Northwind Ag. Spring kits could bundle a station.",
        "email": "luis@northwindag.com",
        "profile_url": "https://www.linkedin.com/in/luis-ortega-demo",
        "subject": "Spring kits and a field station",
        "body": _letter(
            "Hi Luis,",
            "Good to meet you tonight. You mentioned bundling a field station with "
            "the spring kits. I'll send the one-pager and the wholesale note tomorrow.",
        ),
    },
    "samira": {
        "name": "Samira Qureshi",
        "category": "the Editor Pokémon",
        "types": ["Press"],
        "title": "Editor",
        "company": "Dry Creek Review",
        "flavor_text": "Edits Dry Creek Review. Asked for a photo of the dex in the room.",
        "email": "samira@drycreek.review",
        "profile_url": "https://x.com/samiraqureshi_demo",
        "subject": "Photo of the dex, as promised",
        "body": _letter(
            "Hi Samira,",
            "Thanks for stopping by. I'll send a photo of the dex on the table and "
            "a two-sentence note you can cut down.",
        ),
    },
}


def lookup_profile(url: str = "", name: str = "") -> dict | None:
    url_key = (url or "").strip().rstrip("/").lower()
    name_key = (name or "").strip().lower()
    pools = list(SAMPLES.values()) + [
        {k: person[k] for k in person if k not in ("minutes_ago", "caught")}
        for person in SEED
    ]
    for person in pools:
        if url_key and person["profile_url"].rstrip("/").lower() == url_key:
            return person
        if name_key and person["name"].lower() == name_key:
            return person
    return None
