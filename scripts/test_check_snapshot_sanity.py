"""Tests for the snapshot sanity gate."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from check_snapshot_sanity import (  # noqa: E402
    plausibility_check,
    roster_churn,
    waived_checks,
)


def rows(*names):
    return [{"name": name, "netWorth": 2e9} for name in names]


def test_roster_churn_ignores_family_suffix_flips():
    previous = rows("Gordon Getty & family", "Edythe Broad & family", "Stays Put")
    current = rows("Gordon Getty", "Edythe Broad", "Stays Put", "New Person")

    assert roster_churn(current, previous) == 1


def test_roster_churn_compares_raw_rows_on_both_sides():
    tracked = {"name": "Tracked Departure", "netWorth": 2e9, "includeInRawForbes": False}

    assert roster_churn(rows("A") + [tracked], rows("A")) == 0
    assert roster_churn(rows("A"), rows("A") + [tracked]) == 0


def test_a_plausibility_failure_names_the_check_that_can_waive_it():
    with pytest.raises(SystemExit, match="SNAPSHOT_SANITY_ALLOW=roster-churn"):
        plausibility_check("roster-churn", False, "55 people entered or left", set())


def test_a_waived_plausibility_check_passes(capsys):
    plausibility_check("roster-churn", False, "55 people entered or left", {"roster-churn"})

    assert "Waived (roster-churn)" in capsys.readouterr().out


def test_waived_checks_parses_the_environment_and_rejects_unknown_names():
    assert waived_checks({"SNAPSHOT_SANITY_ALLOW": " total-move, roster-churn "}) == {
        "total-move",
        "roster-churn",
    }
    assert waived_checks({}) == set()
    with pytest.raises(SystemExit, match="unknown check names"):
        waived_checks({"SNAPSHOT_SANITY_ALLOW": "everything"})
