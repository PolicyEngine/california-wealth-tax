"""
Fetch latest California billionaire data from Forbes real-time API.

Usage:
    python scripts/fetch_forbes.py

Outputs:
    data/billionaires_live.json  — latest Forbes wealth data for CA billionaires
    data/billionaires_live.csv   — same as CSV

Merges Forbes data with local correction metadata:
- directly held real estate from the Rauh snapshot
- corrected-base exclusions
- departure timing from Rauh Tables 6/7
"""

import csv
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

FORBES_API = "https://www.forbes.com/forbesapi/person/rtb/0/position/true.json"
DATA_DIR = Path(__file__).parent.parent / "data"


def load_json(path):
    with open(path) as f:
        return json.load(f)


def load_rauh_real_estate():
    """Load real estate data from Rauh snapshot."""
    path = DATA_DIR / "billionaires_rauh.json"
    if not path.exists():
        return {}
    data = load_json(path)
    return {b["name"]: b.get("realEstate", 0) for b in data}


def load_billionaire_metadata():
    path = DATA_DIR / "billionaire_metadata.json"
    if not path.exists():
        return {"byName": {}}
    return load_json(path)


def fetch_forbes_ca():
    """Fetch all CA billionaires from Forbes real-time API."""
    url = (
        f"{FORBES_API}"
        "?limit=3000&fields=uri,personName,finalWorth,state,city,countryOfCitizenship,timestamp"
    )
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


def build_row(person, rauh_re, metadata_by_name):
    name = person["personName"]
    net_worth = person["finalWorth"] * 1e6  # API returns millions
    metadata = metadata_by_name.get(name, {})
    departure_timing = metadata.get("departureTiming")
    exclude_from_corrected_base = metadata.get("excludeFromCorrectedBase", False)
    include_in_raw_forbes = metadata.get("includeInRawForbes", True)

    row = {
        "name": name,
        "netWorth": net_worth,
        "realEstate": rauh_re.get(name, 0),
        "moved": exclude_from_corrected_base or departure_timing is not None,
        "includeInRawForbes": include_in_raw_forbes,
        "excludeFromCorrectedBase": exclude_from_corrected_base,
        "departureTiming": departure_timing,
    }

    return row


def summarize_rows(rows):
    raw_rows = [row for row in rows if row.get("includeInRawForbes", True)]
    corrected_rows = [row for row in rows if not row.get("excludeFromCorrectedBase")]
    pre_snapshot_rows = [
        row for row in corrected_rows if row.get("departureTiming") == "pre_snapshot"
    ]
    post_snapshot_rows = [
        row for row in corrected_rows if row.get("departureTiming") == "post_snapshot"
    ]
    unconfirmed_rows = [
        row for row in corrected_rows if row.get("departureTiming") == "unconfirmed"
    ]

    return {
        "raw_count": len(raw_rows),
        "raw_wealth": sum(row["netWorth"] for row in raw_rows),
        "corrected_count": len(corrected_rows),
        "corrected_wealth": sum(row["netWorth"] for row in corrected_rows),
        "pre_snapshot_count": len(pre_snapshot_rows),
        "pre_snapshot_wealth": sum(row["netWorth"] for row in pre_snapshot_rows),
        "post_snapshot_count": len(post_snapshot_rows),
        "unconfirmed_count": len(unconfirmed_rows),
    }


def main():
    print("Fetching from Forbes real-time API...")
    ca_people, source_date = fetch_forbes_ca()
    print(f"  {len(ca_people)} CA billionaires as of {source_date}")

    rauh_re = load_rauh_real_estate()
    metadata = load_billionaire_metadata()
    metadata_by_name = metadata.get("byName", {})

    billionaires = [
        build_row(person, rauh_re, metadata_by_name) for person in ca_people
    ]
    billionaires.sort(key=lambda row: row["netWorth"], reverse=True)

    json_path = DATA_DIR / "billionaires_live.json"
    with open(json_path, "w") as f:
        json.dump(billionaires, f)
    print(f"  Wrote {json_path}")

    snapshots_dir = Path(__file__).parent.parent / "public" / "snapshots"
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    snapshot_path = snapshots_dir / f"{source_date}.json"
    with open(snapshot_path, "w") as f:
        json.dump(billionaires, f)
    print(f"  Wrote {snapshot_path}")

    all_dates = sorted(
        f.stem for f in snapshots_dir.glob("*.json") if f.stem != "index"
    )
    with open(snapshots_dir / "index.json", "w") as f:
        json.dump(all_dates, f)
    print(f"  Index: {len(all_dates)} dates")

    csv_path = DATA_DIR / "billionaires_live.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "name",
                "netWorth",
                "realEstate",
                "moved",
                "includeInRawForbes",
                "excludeFromCorrectedBase",
                "departureTiming",
            ],
        )
        writer.writeheader()
        writer.writerows(billionaires)
    print(f"  Wrote {csv_path}")

    summary = summarize_rows(billionaires)
    print("\nSummary:")
    print(
        "  Raw Forbes base:"
        f" {summary['raw_count']} billionaires,"
        f" ${summary['raw_wealth'] / 1e9:.1f}B"
    )
    print(
        "  Corrected base:"
        f" {summary['corrected_count']} billionaires,"
        f" ${summary['corrected_wealth'] / 1e9:.1f}B"
    )
    print(
        "  Confirmed pre-snapshot departures:"
        f" {summary['pre_snapshot_count']},"
        f" ${summary['pre_snapshot_wealth'] / 1e9:.1f}B"
    )
    print(
        "  Post-snapshot / reported departures:"
        f" {summary['post_snapshot_count'] + summary['unconfirmed_count']}"
    )
    print(f"  Source date: {source_date}")


if __name__ == "__main__":
    main()
