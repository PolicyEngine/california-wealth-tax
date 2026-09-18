"""Fail if the bundled Forbes snapshot is stale.

`sourceDate` is the day the fetch job last published, so this catches a daily
job that has stopped publishing (a failing fetch, or a tripped sanity gate). It
cannot tell whether Forbes itself has stopped revaluing people;
check_snapshot_sanity.py's frozen-upstream check covers that.

With --warn-only the script reports and exits 0. Pull requests use that: a
branch lags main's daily data commits through no fault of the change under
review.
"""

import json
import sys
from datetime import date
from pathlib import Path

MAX_SNAPSHOT_AGE_DAYS = 2
META_PATH = Path(__file__).parent.parent / "data" / "billionaires_live_meta.json"


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    warn_only = "--warn-only" in argv
    metadata = json.loads(META_PATH.read_text())
    source_date = date.fromisoformat(metadata["sourceDate"])
    age_days = (date.today() - source_date).days

    if age_days > MAX_SNAPSHOT_AGE_DAYS:
        message = (
            "Forbes snapshot is stale: the daily job last published "
            f"{source_date.isoformat()}, {age_days} days ago. Check the "
            "Update Forbes data workflow."
        )
        if warn_only:
            print(f"::warning::{message}")
            return
        raise SystemExit(message)

    print(
        "Daily Forbes job is current: last published "
        f"{source_date.isoformat()} ({age_days} days ago)."
    )


if __name__ == "__main__":
    main()
