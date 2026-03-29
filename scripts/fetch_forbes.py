"""
Fetch latest California billionaire data from Forbes real-time API.

Usage:
    python scripts/fetch_forbes.py

Outputs:
    data/billionaires_live.json  — latest Forbes wealth data for CA billionaires
    data/billionaires_live_meta.json — snapshot date + Forbes timestamp metadata
    data/billionaires_live.csv   — same as CSV

Merges Forbes data with local correction metadata:
- directly held real estate from the Rauh snapshot
- corrected-base exclusions
- departure timing from Rauh Tables 6/7
- synthetic backfills for tracked departures that no longer appear in the
  California subset of the live Forbes feed
"""

import csv
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

FORBES_API = "https://www.forbes.com/forbesapi/person/rtb/0/position/true.json"
DATA_DIR = Path(__file__).parent.parent / "data"
SNAPSHOTS_DIR = Path(__file__).parent.parent / "public" / "snapshots"
NAME_ALIASES = {
    "Sergey Jr Brin": "Sergey Brin",
}


def load_json(path):
    with open(path) as f:
        return json.load(f)


def canonicalize_name(name):
    return NAME_ALIASES.get(name, name)


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


def fetch_forbes_people():
    """Fetch the full Forbes billionaire payload."""
    url = (
        f"{FORBES_API}"
        "?limit=3000&fields=uri,personName,finalWorth,state,city,countryOfCitizenship,timestamp"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "PolicyEngine"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    people = data["personList"]["personsLists"]

    timestamp_ms = people[0]["timestamp"] if people else 0
    source_timestamp = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
    source_date = source_timestamp.strftime("%Y-%m-%d")

    return people, source_date, timestamp_ms, source_timestamp.isoformat()


def build_row(person, rauh_re, metadata_by_name, include_in_raw_forbes=None):
    name = canonicalize_name(person["personName"])
    net_worth = person["finalWorth"] * 1e6  # API returns millions
    metadata = metadata_by_name.get(name, {})
    departure_timing = metadata.get("departureTiming")
    exclude_from_corrected_base = metadata.get("excludeFromCorrectedBase", False)
    if include_in_raw_forbes is None:
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


def build_fallback_row(name, fallback_row, rauh_re, metadata_by_name):
    metadata = metadata_by_name.get(name, {})
    departure_timing = metadata.get("departureTiming") or fallback_row.get("departureTiming")
    exclude_from_corrected_base = metadata.get("excludeFromCorrectedBase", False)

    return {
        "name": name,
        "netWorth": fallback_row["netWorth"],
        "realEstate": fallback_row.get("realEstate", rauh_re.get(name, 0)),
        "moved": exclude_from_corrected_base or departure_timing is not None,
        "includeInRawForbes": False,
        "excludeFromCorrectedBase": exclude_from_corrected_base,
        "departureTiming": departure_timing,
    }


def load_fallback_rows():
    fallback_rows = {}

    rauh_path = DATA_DIR / "billionaires_rauh.json"
    if rauh_path.exists():
        for row in load_json(rauh_path):
            fallback_rows[row["name"]] = row

    metadata = load_billionaire_metadata()
    for rows in metadata.get("syntheticRowsBySnapshot", {}).values():
        for row in rows:
            fallback_rows[row["name"]] = row

    if SNAPSHOTS_DIR.exists():
        for snapshot_path in sorted(SNAPSHOTS_DIR.glob("*.json")):
            if snapshot_path.stem == "index":
                continue
            for row in load_json(snapshot_path):
                fallback_rows[row["name"]] = row

    live_path = DATA_DIR / "billionaires_live.json"
    if live_path.exists():
        for row in load_json(live_path):
            fallback_rows[row["name"]] = row

    return fallback_rows


def augment_tracked_departures(rows, people, rauh_re, metadata_by_name, fallback_rows):
    rows_by_name = {row["name"]: row for row in rows}
    people_by_name = {canonicalize_name(person["personName"]): person for person in people}

    tracked_names = {
        name
        for name, metadata in metadata_by_name.items()
        if metadata.get("departureTiming") is not None
    }

    for name in sorted(tracked_names):
        if name in rows_by_name:
            continue

        if name in people_by_name:
            rows.append(
                build_row(
                    people_by_name[name],
                    rauh_re,
                    metadata_by_name,
                    include_in_raw_forbes=False,
                )
            )
            continue

        if name in fallback_rows:
            rows.append(
                build_fallback_row(name, fallback_rows[name], rauh_re, metadata_by_name)
            )

    return rows


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
    people, source_date, source_timestamp_ms, source_timestamp_iso = fetch_forbes_people()
    ca_people = [p for p in people if p.get("state") == "California"]
    print(f"  {len(ca_people)} CA billionaires as of {source_date}")

    rauh_re = load_rauh_real_estate()
    metadata = load_billionaire_metadata()
    metadata_by_name = metadata.get("byName", {})
    fallback_rows = load_fallback_rows()

    billionaires = [
        build_row(person, rauh_re, metadata_by_name) for person in ca_people
    ]
    billionaires = augment_tracked_departures(
        billionaires, people, rauh_re, metadata_by_name, fallback_rows
    )
    billionaires.sort(key=lambda row: row["netWorth"], reverse=True)

    json_path = DATA_DIR / "billionaires_live.json"
    with open(json_path, "w") as f:
        json.dump(billionaires, f)
    print(f"  Wrote {json_path}")

    metadata_path = DATA_DIR / "billionaires_live_meta.json"
    with open(metadata_path, "w") as f:
        json.dump(
            {
                "sourceDate": source_date,
                "sourceTimestampMs": source_timestamp_ms,
                "sourceTimestampIso": source_timestamp_iso,
            },
            f,
        )
    print(f"  Wrote {metadata_path}")

    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    snapshot_path = SNAPSHOTS_DIR / f"{source_date}.json"
    with open(snapshot_path, "w") as f:
        json.dump(billionaires, f)
    print(f"  Wrote {snapshot_path}")

    all_dates = sorted(
        f.stem for f in SNAPSHOTS_DIR.glob("*.json") if f.stem != "index"
    )
    with open(SNAPSHOTS_DIR / "index.json", "w") as f:
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
    print(f"  Source timestamp: {source_timestamp_iso}")
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
