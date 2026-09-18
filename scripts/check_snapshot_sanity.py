"""Refuse to publish a live snapshot that is malformed, implausible, or
inconsistent with the files the app reads.

Run after scripts/fetch_forbes.py and before committing its output.

The structural checks always apply. The three plausibility checks compare the
new snapshot with earlier ones; they gate the daily publish, and CI waives
them, because a waiver granted to the publish job is not recorded in the data
and the same pair of snapshots would otherwise fail every later CI run. They
can be waived by name when a real event trips them (Forbes' annual list, a
market crash):

    SNAPSHOT_SANITY_ALLOW=roster-churn python scripts/check_snapshot_sanity.py

Names: total-move, roster-churn, frozen-upstream.
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fetch_forbes import normalize_name, synthetic_row_keys  # noqa: E402

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
    "forbesUri",
    "forbesState",
    "forbesCity",
    "forbesCountry",
    "citizenship",
}
MIN_ROWS = 150
MAX_ROWS = 400
MAX_TOTAL_MOVE = 0.30  # share of total wealth, snapshot over snapshot
# People entering plus leaving, snapshot over snapshot, on the join key. The
# stored history peaks at 23 on consecutive days (Forbes 400 refresh, October
# 2025) and 53 across a 24-day gap.
MAX_ROSTER_MOVE = 40
# Markets close on weekends, so two identical totals in a row are normal and the
# stored history never shows more. Four in a row means the feed stopped moving.
MAX_IDENTICAL_TOTALS = 3
WAIVABLE = {"total-move", "roster-churn", "frozen-upstream"}


def load(path):
    return json.loads(path.read_text())


def check(condition, message):
    if not condition:
        raise SystemExit(f"Snapshot sanity check failed: {message}")


def waived_checks(environ=None):
    environ = os.environ if environ is None else environ
    names = {
        name.strip()
        for name in environ.get("SNAPSHOT_SANITY_ALLOW", "").split(",")
        if name.strip()
    }
    unknown = names - WAIVABLE
    check(not unknown, f"unknown check names in SNAPSHOT_SANITY_ALLOW: {sorted(unknown)}")
    return names


def plausibility_check(name, condition, message, waived):
    if condition:
        return
    if name in waived:
        print(f"Waived ({name}): {message}")
        return
    raise SystemExit(
        f"Snapshot sanity check failed ({name}): {message}. If this is a real "
        f"event, rerun with SNAPSHOT_SANITY_ALLOW={name}."
    )


def raw_rows(rows):
    return [row for row in rows if row.get("includeInRawForbes", True)]


def raw_total(rows):
    return sum(row["netWorth"] for row in raw_rows(rows))


def synthetic_rows_in(rows, metadata):
    """Names in `rows` that are synthetic rows valid for one paper date only."""
    synthetic = synthetic_row_keys(metadata)
    return [row["name"] for row in rows if normalize_name(row["name"]) in synthetic]


def feed_looks_frozen(total, previous_totals):
    """True when the total matches each of the last MAX_IDENTICAL_TOTALS snapshots."""
    recent = previous_totals[-MAX_IDENTICAL_TOTALS:]
    return len(recent) >= MAX_IDENTICAL_TOTALS and all(
        previous == total for previous in recent
    )


def roster_churn(rows, previous_rows):
    """People entering plus leaving, on the join key.

    Forbes flips display names between "X" and "X & family"; on 2025-10-17 that
    alone moved 24 exact-string names for a day.
    """
    keys = {normalize_name(row["name"]) for row in raw_rows(rows)}
    previous_keys = {normalize_name(row["name"]) for row in raw_rows(previous_rows)}
    return len(keys ^ previous_keys)


def main():
    waived = waived_checks()
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

    leaked = synthetic_rows_in(live, load(DATA_DIR / "billionaire_metadata.json"))
    check(not leaked, f"synthetic rows in the live file: {leaked}")

    total = raw_total(live)
    check(total > 0, "zero total wealth")

    previous_dates = [d for d in index if d < source_date]
    if previous_dates:
        previous = load(SNAPSHOTS_DIR / f"{previous_dates[-1]}.json")
        previous_total = raw_total(previous)
        if previous_total > 0:
            move = abs(total - previous_total) / previous_total
            plausibility_check(
                "total-move",
                move <= MAX_TOTAL_MOVE,
                f"total wealth moved {move:.1%} since {previous_dates[-1]}",
                waived,
            )
        churn = roster_churn(live, previous)
        plausibility_check(
            "roster-churn",
            churn <= MAX_ROSTER_MOVE,
            f"{churn} people entered or left since {previous_dates[-1]}",
            waived,
        )
        plausibility_check(
            "frozen-upstream",
            not feed_looks_frozen(
                total,
                [
                    raw_total(load(SNAPSHOTS_DIR / f"{d}.json"))
                    for d in previous_dates[-MAX_IDENTICAL_TOTALS:]
                ],
            ),
            f"total wealth is identical across the last {MAX_IDENTICAL_TOTALS + 1} "
            "snapshots; the Forbes feed may have stopped updating",
            waived,
        )

    roster_path = DATA_DIR / "roster_valuations.json"
    if roster_path.exists():
        roster = load(roster_path)
        check(
            roster["sourceDate"] == source_date,
            "roster_valuations.json is not from the live date",
        )
        check(len(roster["rows"]) >= 100, "roster_valuations.json is nearly empty")
        dated_roster_path = ROOT / "public" / "roster_valuations" / f"{source_date}.json"
        check(dated_roster_path.exists(), f"missing roster_valuations/{source_date}.json")
        check(load(dated_roster_path) == roster, "dated roster valuations differ")

    print(
        f"Snapshot {source_date} passes: {len(live)} rows, "
        f"${total / 1e9:.1f}B raw California wealth."
    )


if __name__ == "__main__":
    sys.exit(main())
