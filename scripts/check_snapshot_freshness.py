"""Fail CI if the bundled Forbes snapshot is stale."""

import json
from datetime import date
from pathlib import Path

MAX_SNAPSHOT_AGE_DAYS = 2
META_PATH = Path(__file__).parent.parent / "data" / "billionaires_live_meta.json"


def main():
    metadata = json.loads(META_PATH.read_text())
    source_date = date.fromisoformat(metadata["sourceDate"])
    age_days = (date.today() - source_date).days

    if age_days > MAX_SNAPSHOT_AGE_DAYS:
        raise SystemExit(
            "Forbes snapshot is stale: "
            f"{source_date.isoformat()} is {age_days} days old. "
            "Merge the latest daily data update before deploying app changes."
        )

    print(
        "Forbes snapshot is fresh: "
        f"{source_date.isoformat()} ({age_days} days old)."
    )


if __name__ == "__main__":
    main()
