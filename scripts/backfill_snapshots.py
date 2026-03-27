"""
Backfill daily CA billionaire snapshots from komed3/rtb-api profile histories.

Usage:
    python scripts/backfill_snapshots.py [--since 2025-10-01]

Fetches per-profile history for all CA billionaires and reconstructs
daily snapshots from the specified start date through the latest
available data.
"""

import json
import urllib.request
import argparse
from datetime import datetime
from pathlib import Path
from collections import defaultdict

API_BASE = "https://raw.githubusercontent.com/komed3/rtb-api/main/api"
SNAPSHOTS_DIR = Path(__file__).parent.parent / "public" / "snapshots"

RAUH_DEPARTURES = {
    "Larry Page", "Larry Ellison", "Sergey Brin", "Peter Thiel",
    "Jan Koum", "Lynsi Snyder", "Don Hankey", "Reed Hastings",
    "Drew Houston", "Steven Spielberg", "David Sacks",
    "Mark Zuckerberg", "Andy Fang",
}


def fetch_text(path):
    url = f"{API_BASE}/{path}"
    req = urllib.request.Request(url, headers={"User-Agent": "PolicyEngine"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode()


def fetch_json(path):
    return json.loads(fetch_text(path))


def get_us_slugs():
    return fetch_json("filter/country/us")


def get_profile_info(slug):
    try:
        return fetch_json(f"profile/{slug}/info")
    except Exception:
        return None


def get_profile_history(slug):
    """Returns dict of {date_str: networth_dollars}."""
    try:
        text = fetch_text(f"profile/{slug}/history")
    except Exception:
        return {}

    history = {}
    for line in text.strip().split("\n"):
        parts = line.split()
        if len(parts) >= 3:
            date_str = parts[0]
            networth_millions = float(parts[2])
            history[date_str] = networth_millions * 1e6
    return history


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--since", default="2025-10-01")
    args = parser.parse_args()
    since = args.since

    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1: Get CA billionaire slugs and names
    print("Fetching US billionaire slugs...")
    us_slugs = get_us_slugs()
    print(f"  {len(us_slugs)} US billionaires")

    print("Filtering for California (fetching profiles)...")
    ca_profiles = []
    for i, slug in enumerate(us_slugs):
        if i % 100 == 0 and i > 0:
            print(f"  ...checked {i}/{len(us_slugs)}")
        info = get_profile_info(slug)
        if info and info.get("residence", {}).get("state") == "California":
            ca_profiles.append({
                "slug": slug,
                "name": info.get("name", slug),
            })

    print(f"  Found {len(ca_profiles)} CA billionaires")

    # Step 2: Fetch all histories
    print("Fetching histories...")
    # {date: [{name, netWorth, moved, realEstate}]}
    daily_data = defaultdict(list)

    for i, profile in enumerate(ca_profiles):
        if i % 50 == 0 and i > 0:
            print(f"  ...fetched {i}/{len(ca_profiles)}")
        history = get_profile_history(profile["slug"])
        name = profile["name"]
        moved = name in RAUH_DEPARTURES

        for date_str, net_worth in history.items():
            if date_str >= since:
                daily_data[date_str].append({
                    "name": name,
                    "netWorth": net_worth,
                    "moved": moved,
                    "realEstate": 0,
                })

    # Step 3: Write snapshots
    dates = sorted(daily_data.keys())
    print(f"\nWriting {len(dates)} snapshots ({dates[0]} to {dates[-1]})...")

    for date_str in dates:
        path = SNAPSHOTS_DIR / f"{date_str}.json"
        if path.exists():
            continue
        people = sorted(daily_data[date_str], key=lambda b: b["netWorth"], reverse=True)
        with open(path, "w") as f:
            json.dump(people, f)

    # Step 4: Merge Rauh RE data into Oct 17, 2025 snapshot
    rauh_path = Path(__file__).parent.parent / "data" / "billionaires_rauh.json"
    if rauh_path.exists():
        with open(rauh_path) as f:
            rauh_data = json.load(f)
        re_map = {b["name"]: b.get("realEstate", 0) for b in rauh_data}
        oct17_path = SNAPSHOTS_DIR / "2025-10-17.json"
        if oct17_path.exists():
            with open(oct17_path) as f:
                oct17 = json.load(f)
            for b in oct17:
                b["realEstate"] = re_map.get(b["name"], 0)
            with open(oct17_path, "w") as f:
                json.dump(oct17, f)
            print("  Merged Rauh RE data into 2025-10-17 snapshot")

    # Step 5: Update index
    all_files = sorted(SNAPSHOTS_DIR.glob("*.json"))
    dates = [f.stem for f in all_files if f.stem != "index"]
    with open(SNAPSHOTS_DIR / "index.json", "w") as f:
        json.dump(dates, f)
    print(f"  Index: {len(dates)} dates")

    print("Done.")


if __name__ == "__main__":
    main()
