"""
Fetch latest California billionaire data from Forbes real-time API.

Usage:
    python scripts/fetch_forbes.py

Outputs:
    data/billionaires_live.json  — latest Forbes wealth data for CA billionaires
    data/billionaires_live.csv   — same as CSV

Merges with Rauh et al. departure/real-estate data where available.
"""

import json
import csv
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

FORBES_API = "https://www.forbes.com/forbesapi/person/rtb/0/position/true.json"
DATA_DIR = Path(__file__).parent.parent / "data"

# From Rauh et al. replication data and paper Tables 6/7
RAUH_DEPARTURES = {
    "Larry Page", "Larry Ellison", "Sergey Brin", "Peter Thiel",
    "Jan Koum", "Lynsi Snyder", "Don Hankey", "Reed Hastings",
    "Drew Houston", "Steven Spielberg", "David Sacks",
    "Mark Zuckerberg", "Andy Fang",
}


def load_rauh_real_estate():
    """Load real estate data from Rauh snapshot."""
    path = DATA_DIR / "billionaires_rauh.json"
    if not path.exists():
        return {}
    with open(path) as f:
        data = json.load(f)
    return {b["name"]: b.get("realEstate", 0) for b in data}


def fetch_forbes_ca():
    """Fetch all CA billionaires from Forbes real-time API."""
    url = f"{FORBES_API}?limit=3000&fields=uri,personName,finalWorth,state,city,countryOfCitizenship,timestamp"
    req = urllib.request.Request(url, headers={"User-Agent": "PolicyEngine"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    people = data["personList"]["personsLists"]
    ca = [p for p in people if p.get("state") == "California"]

    timestamp_ms = ca[0]["timestamp"] if ca else 0
    source_date = datetime.fromtimestamp(
        timestamp_ms / 1000, tz=timezone.utc
    ).strftime("%Y-%m-%d")

    return ca, source_date


def main():
    print("Fetching from Forbes real-time API...")
    ca_people, source_date = fetch_forbes_ca()
    print(f"  {len(ca_people)} CA billionaires as of {source_date}")

    rauh_re = load_rauh_real_estate()

    billionaires = []
    for p in ca_people:
        name = p["personName"]
        net_worth = p["finalWorth"] * 1e6  # API returns millions
        billionaires.append({
            "name": name,
            "netWorth": net_worth,
            "moved": name in RAUH_DEPARTURES,
            "realEstate": rauh_re.get(name, 0),
        })

    billionaires.sort(key=lambda b: b["netWorth"], reverse=True)

    # Write JSON
    json_path = DATA_DIR / "billionaires_live.json"
    with open(json_path, "w") as f:
        json.dump(billionaires, f)
    print(f"  Wrote {json_path}")

    # Write dated snapshot
    snapshots_dir = Path(__file__).parent.parent / "public" / "snapshots"
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    snapshot_path = snapshots_dir / f"{source_date}.json"
    with open(snapshot_path, "w") as f:
        json.dump(billionaires, f)
    print(f"  Wrote {snapshot_path}")

    # Update index
    all_dates = sorted(
        f.stem for f in snapshots_dir.glob("*.json") if f.stem != "index"
    )
    with open(snapshots_dir / "index.json", "w") as f:
        json.dump(all_dates, f)
    print(f"  Index: {len(all_dates)} dates")

    # Write CSV
    csv_path = DATA_DIR / "billionaires_live.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(
            f, fieldnames=["name", "netWorth", "moved", "realEstate"]
        )
        writer.writeheader()
        writer.writerows(billionaires)
    print(f"  Wrote {csv_path}")

    # Update source date in page data snapshot
    model_path = Path(__file__).parent.parent / "app" / "page.js"
    text = model_path.read_text()
    import re

    new_text = re.sub(
        r'(live:\s*\{[^}]*label:\s*")[^"]+(")',
        lambda m: f'{m.group(1)}{datetime.strptime(source_date, "%Y-%m-%d").strftime("%b %-d, %Y")}{m.group(2)}',
        text,
    )
    new_text = re.sub(
        r'(live:\s*\{[^}]*date:\s*new Date\(")[^"]+("\))',
        lambda m: f"{m.group(1)}{source_date}{m.group(2)}",
        new_text,
    )
    if new_text != text:
        model_path.write_text(new_text)
        print(f"  Updated live snapshot date to {source_date}")

    # Summary
    total = sum(b["netWorth"] for b in billionaires)
    movers = [b for b in billionaires if b["moved"]]
    mover_wealth = sum(b["netWorth"] for b in movers)
    stayer_wealth = total - mover_wealth
    print(f"\nSummary:")
    print(f"  Total: {len(billionaires)} billionaires, ${total / 1e9:.1f}B")
    print(f"  Movers: {len(movers)}, ${mover_wealth / 1e9:.1f}B")
    print(f"  Stayers: {len(billionaires) - len(movers)}, ${stayer_wealth / 1e9:.1f}B")
    print(f"  Source date: {source_date}")


if __name__ == "__main__":
    main()
