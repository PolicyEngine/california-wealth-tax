"""
Fetch latest California billionaire data from komed3/rtb-api.

Usage:
    python scripts/fetch_forbes.py

Outputs:
    data/billionaires.json  — updated with latest Forbes net worth
    data/billionaires.csv   — same data as CSV for inspection

Merges with Rauh et al. departure/real-estate data where available.
"""

import json
import csv
import time
import urllib.request
from pathlib import Path

API_BASE = "https://raw.githubusercontent.com/komed3/rtb-api/main/api"
DATA_DIR = Path(__file__).parent.parent / "data"
RAUH_DEPARTURES = {
    "Larry Page", "Larry Ellison", "Sergey Brin", "Peter Thiel",
    "Jan Koum", "Lynsi Snyder", "Don Hankey", "Reed Hastings",
    "Drew Houston",
}


def fetch_json(path):
    url = f"{API_BASE}/{path}"
    req = urllib.request.Request(url, headers={"User-Agent": "PolicyEngine"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def fetch_text(path):
    url = f"{API_BASE}/{path}"
    req = urllib.request.Request(url, headers={"User-Agent": "PolicyEngine"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode()


def get_latest_net_worth(slug):
    """Parse space-delimited history, return (date, net_worth_dollars)."""
    text = fetch_text(f"profile/{slug}/history")
    lines = text.strip().split("\n")
    if not lines:
        return None, 0
    last = lines[-1].split()
    # Format: date rank networth_millions change_millions change_pct
    date = last[0]
    net_worth_millions = float(last[2])
    return date, net_worth_millions * 1e6


def load_rauh_real_estate():
    """Load real estate data from existing billionaires.json."""
    path = DATA_DIR / "billionaires.json"
    if not path.exists():
        return {}
    with open(path) as f:
        data = json.load(f)
    return {b["name"]: b.get("realEstate", 0) for b in data}


def main():
    print("Fetching US billionaire slugs...")
    us_slugs = fetch_json("filter/country/us")
    print(f"  {len(us_slugs)} US billionaires")

    print("Fetching profiles to filter for California...")
    ca_billionaires = []
    latest_date = None

    for i, slug in enumerate(us_slugs):
        if i % 50 == 0 and i > 0:
            print(f"  ...checked {i}/{len(us_slugs)}")

        try:
            info = fetch_json(f"profile/{slug}/info")
        except Exception as e:
            print(f"  SKIP {slug}: {e}")
            continue

        state = info.get("residence", {}).get("state", "")
        if state != "California":
            continue

        # Get latest net worth
        try:
            date, net_worth = get_latest_net_worth(slug)
        except Exception as e:
            print(f"  SKIP {slug} history: {e}")
            continue

        if net_worth <= 0:
            continue

        if date and (latest_date is None or date > latest_date):
            latest_date = date

        name = info.get("name", slug)
        ca_billionaires.append({
            "slug": slug,
            "name": name,
            "netWorth": net_worth,
            "moved": name in RAUH_DEPARTURES,
        })

        # Gentle rate limiting
        if i % 10 == 0:
            time.sleep(0.1)

    print(f"  Found {len(ca_billionaires)} CA billionaires")
    print(f"  Latest data: {latest_date}")

    # Merge real estate from Rauh data
    rauh_re = load_rauh_real_estate()
    for b in ca_billionaires:
        b["realEstate"] = rauh_re.get(b["name"], 0)

    # Sort by net worth descending
    ca_billionaires.sort(key=lambda b: b["netWorth"], reverse=True)

    # Remove slug before saving
    output = [{k: v for k, v in b.items() if k != "slug"} for b in ca_billionaires]

    # Write JSON
    json_path = DATA_DIR / "billionaires.json"
    with open(json_path, "w") as f:
        json.dump(output, f)
    print(f"  Wrote {json_path}")

    # Write CSV
    csv_path = DATA_DIR / "billionaires.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "netWorth", "moved", "realEstate"])
        writer.writeheader()
        writer.writerows(output)
    print(f"  Wrote {csv_path}")

    # Update data source date in microModel.js
    if latest_date:
        model_path = Path(__file__).parent.parent / "lib" / "microModel.js"
        text = model_path.read_text()
        import re
        new_text = re.sub(
            r'export const DATA_SOURCE_DATE = new Date\("[^"]+"\)',
            f'export const DATA_SOURCE_DATE = new Date("{latest_date}")',
            text,
        )
        if new_text != text:
            model_path.write_text(new_text)
            print(f"  Updated DATA_SOURCE_DATE to {latest_date}")

    # Summary
    total_wealth = sum(b["netWorth"] for b in output)
    mover_wealth = sum(b["netWorth"] for b in output if b["moved"])
    stayer_wealth = total_wealth - mover_wealth
    movers = sum(1 for b in output if b["moved"])
    print(f"\nSummary:")
    print(f"  Total: {len(output)} billionaires, ${total_wealth/1e9:.1f}B")
    print(f"  Movers: {movers}, ${mover_wealth/1e9:.1f}B")
    print(f"  Stayers: {len(output)-movers}, ${stayer_wealth/1e9:.1f}B")


if __name__ == "__main__":
    main()
