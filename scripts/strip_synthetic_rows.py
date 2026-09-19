"""Remove synthetic rows from stored snapshots they were never valid for.

`syntheticRowsBySnapshot` in data/billionaire_metadata.json holds rows that
reproduce a published table on one date. An earlier fetcher treated them as a
last-known valuation and wrote them into every daily snapshot. The app adds
them for their own date at run time, so no stored snapshot needs them.

Usage:
    python scripts/strip_synthetic_rows.py
"""

import json

from fetch_forbes import (
    DATA_DIR,
    SNAPSHOTS_DIR,
    load_billionaire_metadata,
    normalize_name,
    synthetic_row_keys,
)


def strip(path, keys):
    rows = json.loads(path.read_text())
    kept = [row for row in rows if normalize_name(row["name"]) not in keys]
    if len(kept) == len(rows):
        return 0
    path.write_text(json.dumps(kept))
    return len(rows) - len(kept)


def main():
    keys = synthetic_row_keys(load_billionaire_metadata())
    paths = [p for p in sorted(SNAPSHOTS_DIR.glob("*.json")) if p.stem != "index"]
    paths.append(DATA_DIR / "billionaires_live.json")
    changed = sum(1 for path in paths if path.exists() and strip(path, keys))
    print(f"Removed synthetic rows from {changed} files.")


if __name__ == "__main__":
    main()
