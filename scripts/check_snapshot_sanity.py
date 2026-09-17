"""Refuse to publish a live snapshot that is malformed, implausible, or
inconsistent with the files the app reads.

Run after scripts/fetch_forbes.py and before committing its output.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
SNAPSHOTS_DIR = ROOT / "public" / "snapshots"
REQUIRED_FIELDS = {
    "name",
    "netWorth",
    "realEstate",
    "moved",
    "includeInRawForbes",
    "excludeFromCorrectedBase",
    "departureTiming",
}
MIN_ROWS = 150
MAX_ROWS = 400
MAX_TOTAL_MOVE = 0.30  # share of total wealth, day over day
MAX_ROSTER_MOVE = 40  # names entering plus leaving, day over day


def load(path):
    return json.loads(path.read_text())


def check(condition, message):
    if not condition:
        raise SystemExit(f"Snapshot sanity check failed: {message}")


def main():
    meta = load(DATA_DIR / "billionaires_live_meta.json")
    source_date = meta["sourceDate"]
    check(source_date >= "2025-10-01", f"implausible source date {source_date}")

    live = load(DATA_DIR / "billionaires_live.json")
    snapshot_path = SNAPSHOTS_DIR / f"{source_date}.json"
    check(snapshot_path.exists(), f"missing {snapshot_path.name}")
    check(load(snapshot_path) == live, "live file and dated snapshot differ")

    index = load(SNAPSHOTS_DIR / "index.json")
    on_disk = sorted(p.stem for p in SNAPSHOTS_DIR.glob("*.json") if p.stem != "index")
    check(index == on_disk, "index.json does not match the snapshot files")
    check(index[-1] == source_date, "latest snapshot is not the live date")

    check(MIN_ROWS <= len(live) <= MAX_ROWS, f"{len(live)} rows")
    names = [row["name"] for row in live]
    check(len(names) == len(set(names)), "duplicate names")
    for row in live:
        missing = REQUIRED_FIELDS - set(row)
        check(not missing, f"{row.get('name')} missing {sorted(missing)}")
        check(
            isinstance(row["netWorth"], (int, float)) and row["netWorth"] >= 0,
            f"{row['name']} has net worth {row['netWorth']}",
        )

    raw = [row for row in live if row.get("includeInRawForbes", True)]
    total = sum(row["netWorth"] for row in raw)
    check(total > 0, "zero total wealth")

    previous_dates = [d for d in index if d < source_date]
    if previous_dates:
        previous = load(SNAPSHOTS_DIR / f"{previous_dates[-1]}.json")
        previous_raw = [row for row in previous if row.get("includeInRawForbes", True)]
        previous_total = sum(row["netWorth"] for row in previous_raw)
        if previous_total > 0:
            move = abs(total - previous_total) / previous_total
            check(
                move <= MAX_TOTAL_MOVE,
                f"total wealth moved {move:.1%} since {previous_dates[-1]}",
            )
        previous_names = {row["name"] for row in previous_raw}
        churn = len(set(names) ^ previous_names)
        check(
            churn <= MAX_ROSTER_MOVE,
            f"{churn} names entered or left since {previous_dates[-1]}",
        )

    roster_path = DATA_DIR / "roster_valuations.json"
    if roster_path.exists():
        roster = load(roster_path)
        check(
            roster["sourceDate"] == source_date,
            "roster_valuations.json is not from the live date",
        )
        check(len(roster["rows"]) >= 100, "roster_valuations.json is nearly empty")

    print(
        f"Snapshot {source_date} passes: {len(live)} rows, "
        f"${total / 1e9:.1f}B raw California wealth."
    )


if __name__ == "__main__":
    sys.exit(main())
