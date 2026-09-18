"""
Fetch latest California billionaire data from Forbes real-time API.

Usage:
    python scripts/fetch_forbes.py [--force]

Outputs:
    data/billionaires_live.json       — latest Forbes wealth data for CA billionaires
    data/billionaires_live_meta.json  — snapshot date + Forbes timestamp metadata
    data/billionaires_live.csv        — same as CSV
    data/roster_valuations.json       — latest Forbes worth, in any state, for everyone
                                        on the January 1, 2026 residency roster
    public/roster_valuations/<date>.json — dated copy of the roster valuations
    public/snapshots/<date>.json      — dated copy of the live file

Merges Forbes data with local metadata:
- directly held real estate from the Rauh snapshot
- contested-residency flags and reported departure timing
- synthetic backfills for tracked departures that no longer appear in the
  California subset of the live Forbes feed

Names are joined on a normalized key (alias map, trailing "& family" removed,
case-folded) so a Forbes display-name change does not drop a person.
"""

import csv
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

FORBES_API = "https://www.forbes.com/forbesapi/person/rtb/0/position/true.json"
FORBES_FIELDS = (
    "uri,personName,finalWorth,state,city,country,countryOfCitizenship,timestamp"
)
DATA_DIR = Path(__file__).parent.parent / "data"
SNAPSHOTS_DIR = Path(__file__).parent.parent / "public" / "snapshots"
ROSTER_VALUATIONS_DIR = Path(__file__).parent.parent / "public" / "roster_valuations"
RESIDENCY_ROSTER_DATE = "2026-01-01"
# Forbes tracked 3,392 people on 2026-09-18, some of them below $1 billion. The
# request asks for more than that and the payload's own `count` is checked, so a
# clipped list fails instead of silently dropping the people at the bottom.
FORBES_REQUEST_LIMIT = 10000
MIN_FORBES_PEOPLE = 1000
MIN_CALIFORNIA_PEOPLE = 100
NAME_ALIASES = {
    "Sergey Jr Brin": "Sergey Brin",
    "Archie Aldis Emmerson & family": "Archie Aldis Emmerson",
}
FAMILY_SUFFIX = re.compile(r"\s*&\s*family\s*$", re.IGNORECASE)
CSV_FIELDS = [
    "name",
    "netWorth",
    "realEstate",
    "moved",
    "includeInRawForbes",
    "excludeFromCorrectedBase",
    "departureTiming",
    "forbesUri",
    "forbesState",
    "forbesCity",
    "forbesCountry",
    "citizenship",
]


def load_json(path):
    with open(path) as f:
        return json.load(f)


def canonicalize_name(name):
    """Display name stored in snapshots."""
    return NAME_ALIASES.get(name, name)


def normalize_name(name):
    """Join key: alias applied, trailing '& family' removed, case-folded."""
    return FAMILY_SUFFIX.sub("", canonicalize_name(name).strip()).casefold()


def load_rauh_real_estate():
    """Directly held real estate from the Rauh snapshot, keyed by join key."""
    path = DATA_DIR / "billionaires_rauh.json"
    if not path.exists():
        return {}
    data = load_json(path)
    return {normalize_name(b["name"]): b.get("realEstate", 0) for b in data}


def load_billionaire_metadata():
    path = DATA_DIR / "billionaire_metadata.json"
    if not path.exists():
        return {"byName": {}}
    return load_json(path)


def metadata_by_key(metadata):
    return {
        normalize_name(name): entry
        for name, entry in metadata.get("byName", {}).items()
    }


def check_payload_complete(people, reported_count, limit=FORBES_REQUEST_LIMIT):
    """Refuse a payload the request limit or the server clipped."""
    if len(people) >= limit:
        raise RuntimeError(
            f"Forbes returned {len(people)} people, the request limit; raise "
            "FORBES_REQUEST_LIMIT so the list is not clipped"
        )
    if reported_count is not None and len(people) != reported_count:
        raise RuntimeError(
            f"Forbes reports {reported_count} people but returned {len(people)}"
        )


def fetch_forbes_people():
    """Fetch the full Forbes billionaire payload."""
    url = f"{FORBES_API}?limit={FORBES_REQUEST_LIMIT}&fields={FORBES_FIELDS}"
    req = urllib.request.Request(url, headers={"User-Agent": "PolicyEngine"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())

    people = data["personList"]["personsLists"]
    if not people:
        raise RuntimeError("Forbes returned an empty billionaire list")
    check_payload_complete(people, data["personList"].get("count"))

    # Forbes stamps every record with the time it served the payload, so this is
    # the fetch time, not a valuation time. check_snapshot_sanity.py watches for
    # an upstream feed that has stopped moving.
    timestamp_ms = max(person.get("timestamp") or 0 for person in people)
    if timestamp_ms <= 0:
        raise RuntimeError("Forbes payload carries no timestamp")
    source_timestamp = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
    source_date = source_timestamp.strftime("%Y-%m-%d")

    return people, source_date, timestamp_ms, source_timestamp.isoformat()


def validate_payload(people, ca_people, source_date, latest_snapshot_date=None):
    """Refuse to publish a partial, empty, or stale payload."""
    if len(people) < MIN_FORBES_PEOPLE:
        raise RuntimeError(
            f"Forbes payload has {len(people)} people; expected at least "
            f"{MIN_FORBES_PEOPLE}"
        )
    if len(ca_people) < MIN_CALIFORNIA_PEOPLE:
        raise RuntimeError(
            f"Forbes payload has {len(ca_people)} California rows; expected at "
            f"least {MIN_CALIFORNIA_PEOPLE}"
        )
    if latest_snapshot_date and source_date < latest_snapshot_date:
        raise RuntimeError(
            f"Forbes source date {source_date} is older than the latest stored "
            f"snapshot {latest_snapshot_date}"
        )


def forbes_location(person):
    return {
        "forbesUri": person.get("uri"),
        "forbesState": person.get("state"),
        "forbesCity": person.get("city"),
        "forbesCountry": person.get("country"),
        "citizenship": person.get("countryOfCitizenship"),
    }


def build_row(person, rauh_re, metadata_by_name, include_in_raw_forbes=None):
    name = canonicalize_name(person["personName"])
    key = normalize_name(name)
    net_worth = person["finalWorth"] * 1e6  # API returns millions
    metadata = metadata_by_name.get(key, {})
    departure_timing = metadata.get("departureTiming")
    exclude_from_corrected_base = metadata.get("excludeFromCorrectedBase", False)
    if include_in_raw_forbes is None:
        include_in_raw_forbes = metadata.get("includeInRawForbes", True)

    return {
        "name": name,
        "netWorth": net_worth,
        "realEstate": rauh_re.get(key, 0),
        "moved": exclude_from_corrected_base or departure_timing is not None,
        "includeInRawForbes": include_in_raw_forbes,
        "excludeFromCorrectedBase": exclude_from_corrected_base,
        "departureTiming": departure_timing,
        **forbes_location(person),
    }


def build_fallback_row(name, fallback_row, rauh_re, metadata_by_name):
    key = normalize_name(name)
    metadata = metadata_by_name.get(key, {})
    departure_timing = metadata.get("departureTiming") or fallback_row.get(
        "departureTiming"
    )
    exclude_from_corrected_base = metadata.get("excludeFromCorrectedBase", False)

    return {
        "name": name,
        "netWorth": fallback_row["netWorth"],
        "realEstate": fallback_row.get("realEstate", rauh_re.get(key, 0)),
        "moved": exclude_from_corrected_base or departure_timing is not None,
        "includeInRawForbes": False,
        "excludeFromCorrectedBase": exclude_from_corrected_base,
        "departureTiming": departure_timing,
        "forbesUri": None,
        "forbesState": None,
        "forbesCity": None,
        "forbesCountry": None,
        "citizenship": None,
    }


def load_fallback_rows():
    """Last known row per person, keyed by join key."""
    fallback_rows = {}

    rauh_path = DATA_DIR / "billionaires_rauh.json"
    if rauh_path.exists():
        for row in load_json(rauh_path):
            fallback_rows[normalize_name(row["name"])] = row

    # Rows in `syntheticRowsBySnapshot` reproduce one paper's table on one date.
    # The app adds them for that date; they are not a valuation for any other.
    synthetic_keys = synthetic_row_keys(load_billionaire_metadata())

    if SNAPSHOTS_DIR.exists():
        for snapshot_path in sorted(SNAPSHOTS_DIR.glob("*.json")):
            if snapshot_path.stem == "index":
                continue
            for row in load_json(snapshot_path):
                fallback_rows[normalize_name(row["name"])] = row

    live_path = DATA_DIR / "billionaires_live.json"
    if live_path.exists():
        for row in load_json(live_path):
            fallback_rows[normalize_name(row["name"])] = row

    return {
        key: row for key, row in fallback_rows.items() if key not in synthetic_keys
    }


def synthetic_row_keys(metadata):
    return {
        normalize_name(row["name"])
        for rows in metadata.get("syntheticRowsBySnapshot", {}).values()
        for row in rows
    }


def last_listed_valuations(snapshots_dir=None):
    """Last positive Forbes valuation per person across the stored snapshots.

    Returns {join key: (date, net worth)}. Rows the fetcher wrote from a
    fallback (no Forbes URI, `includeInRawForbes` false) are not Forbes
    valuations for that date and are skipped.
    """
    snapshots_dir = SNAPSHOTS_DIR if snapshots_dir is None else snapshots_dir
    last_listed = {}
    if not snapshots_dir.exists():
        return last_listed

    for snapshot_path in sorted(snapshots_dir.glob("*.json")):
        if snapshot_path.stem == "index":
            continue
        for row in load_json(snapshot_path):
            if row.get("includeInRawForbes") is False or row.get("netWorth", 0) <= 0:
                continue
            last_listed[normalize_name(row["name"])] = (
                snapshot_path.stem,
                row["netWorth"],
            )

    return last_listed


def augment_tracked_departures(rows, people, rauh_re, metadata, fallback_rows):
    """Keep tracked departures in the file after Forbes moves them out of California.

    `metadata` is the raw metadata `byName` mapping (display name -> entry).
    """
    rows_by_key = {normalize_name(row["name"]): row for row in rows}
    people_by_key = {normalize_name(person["personName"]): person for person in people}
    metadata_by_name = {normalize_name(name): entry for name, entry in metadata.items()}

    tracked_names = sorted(
        name
        for name, entry in metadata.items()
        if entry.get("departureTiming") is not None
    )

    for name in tracked_names:
        key = normalize_name(name)
        if key in rows_by_key:
            continue

        if key in people_by_key:
            rows.append(
                build_row(
                    people_by_key[key],
                    rauh_re,
                    metadata_by_name,
                    include_in_raw_forbes=False,
                )
            )
            continue

        if key in fallback_rows:
            rows.append(
                build_fallback_row(name, fallback_rows[key], rauh_re, metadata_by_name)
            )

    return rows


def build_roster_valuations(people, roster_rows, last_listed=None):
    """Latest Forbes worth, in any state, for each person on the residency roster.

    The measure fixes residency on January 1, 2026 and values net worth on
    December 31, 2026, so a roster member Forbes now lists elsewhere still needs
    a current valuation. Someone Forbes no longer lists at all gets the last
    value Forbes published for them, with the date, under `lastListedDate`:
    Forbes drops people for several reasons (death among them), so absence says
    nothing about their net worth. Someone with no stored valuation is omitted.
    """
    people_by_key = {normalize_name(person["personName"]): person for person in people}
    last_listed = last_listed or {}
    valuations = {}

    for row in roster_rows:
        key = normalize_name(row["name"])
        person = people_by_key.get(key)
        if person is not None:
            valuations[row["name"]] = {
                "netWorth": person["finalWorth"] * 1e6,
                **forbes_location(person),
            }
        elif key in last_listed:
            last_date, last_net_worth = last_listed[key]
            valuations[row["name"]] = {
                "netWorth": last_net_worth,
                "lastListedDate": last_date,
            }

    return valuations


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


def latest_snapshot_date():
    if not SNAPSHOTS_DIR.exists():
        return None
    dates = sorted(f.stem for f in SNAPSHOTS_DIR.glob("*.json") if f.stem != "index")
    return dates[-1] if dates else None


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    force = "--force" in argv

    print("Fetching from Forbes real-time API...")
    people, source_date, source_timestamp_ms, source_timestamp_iso = fetch_forbes_people()
    ca_people = [p for p in people if p.get("state") == "California"]
    validate_payload(
        people,
        ca_people,
        source_date,
        latest_snapshot_date=None if force else latest_snapshot_date(),
    )
    print(f"  {len(ca_people)} CA billionaires as of {source_date}")

    rauh_re = load_rauh_real_estate()
    metadata = load_billionaire_metadata()
    metadata_by_name = metadata_by_key(metadata)
    fallback_rows = load_fallback_rows()

    billionaires = [
        build_row(person, rauh_re, metadata_by_name) for person in ca_people
    ]
    billionaires = augment_tracked_departures(
        billionaires, people, rauh_re, metadata.get("byName", {}), fallback_rows
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

    roster_path = SNAPSHOTS_DIR / f"{RESIDENCY_ROSTER_DATE}.json"
    if roster_path.exists():
        roster_valuations = {
            "sourceDate": source_date,
            "rosterDate": RESIDENCY_ROSTER_DATE,
            "rows": build_roster_valuations(
                people, load_json(roster_path), last_listed_valuations()
            ),
        }
        ROSTER_VALUATIONS_DIR.mkdir(parents=True, exist_ok=True)
        for roster_valuations_path in (
            DATA_DIR / "roster_valuations.json",
            ROSTER_VALUATIONS_DIR / f"{source_date}.json",
        ):
            with open(roster_valuations_path, "w") as f:
                json.dump(roster_valuations, f)
            print(
                f"  Wrote {roster_valuations_path} "
                f"({len(roster_valuations['rows'])} people)"
            )

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
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
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
        "  Reported pre-January 1 departures:"
        f" {summary['pre_snapshot_count']},"
        f" ${summary['pre_snapshot_wealth'] / 1e9:.1f}B"
    )
    print(
        "  Later / reported departures:"
        f" {summary['post_snapshot_count'] + summary['unconfirmed_count']}"
    )
    print(f"  Source date: {source_date}")


if __name__ == "__main__":
    main()
