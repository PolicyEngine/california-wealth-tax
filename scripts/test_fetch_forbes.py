"""Tests for the Forbes snapshot fetcher."""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from fetch_forbes import (  # noqa: E402
    MIN_CALIFORNIA_PEOPLE,
    MIN_FORBES_PEOPLE,
    augment_tracked_departures,
    build_roster_valuations,
    build_row,
    canonicalize_name,
    fetch_forbes_people,
    normalize_name,
    summarize_rows,
    validate_payload,
)


def person(uri, name, worth_millions, state, city, timestamp=1774511402160):
    return {
        "uri": uri,
        "personName": name,
        "finalWorth": worth_millions,
        "state": state,
        "city": city,
        "country": None,
        "countryOfCitizenship": "United States",
        "timestamp": timestamp,
    }


MOCK_RESPONSE = {
    "personList": {
        "personsLists": [
            person("larry-page", "Larry Page", 233000.0, "California", "Palo Alto"),
            person("elon-musk", "Elon Musk", 827000.0, "Texas", "Austin"),
            person(
                "sergey-jr-brin",
                "Sergey Jr Brin",
                150000.0,
                "California",
                "Los Altos",
                timestamp=1774511402170,
            ),
            person("ken-xie", "Ken Xie & family", 11550.0, "California", "Atherton"),
        ]
    }
}


def make_mock_response(data):
    mock = MagicMock()
    mock.read.return_value = json.dumps(data).encode()
    mock.__enter__ = lambda s: s
    mock.__exit__ = MagicMock(return_value=False)
    return mock


def test_fetch_forbes_people_dates_the_snapshot_by_the_latest_timestamp():
    with patch("urllib.request.urlopen", return_value=make_mock_response(MOCK_RESPONSE)):
        people, source_date, source_timestamp_ms, source_timestamp_iso = fetch_forbes_people()

    assert len(people) == 4
    assert people[0]["personName"] == "Larry Page"
    assert source_date == "2026-03-26"
    assert source_timestamp_ms == 1774511402170
    assert source_timestamp_iso == "2026-03-26T07:50:02.170000+00:00"


def test_fetch_forbes_people_rejects_an_empty_payload():
    empty = {"personList": {"personsLists": []}}
    with patch("urllib.request.urlopen", return_value=make_mock_response(empty)):
        with pytest.raises(RuntimeError):
            fetch_forbes_people()


def test_validate_payload_rejects_partial_and_stale_payloads():
    people = [person(f"p{i}", f"Person {i}", 1000.0, "California", "X") for i in range(MIN_FORBES_PEOPLE)]
    ca_people = people[:MIN_CALIFORNIA_PEOPLE]

    validate_payload(people, ca_people, "2026-09-17", latest_snapshot_date="2026-09-16")
    validate_payload(people, ca_people, "2026-09-17", latest_snapshot_date="2026-09-17")

    with pytest.raises(RuntimeError):
        validate_payload(people[:-1], ca_people, "2026-09-17")
    with pytest.raises(RuntimeError):
        validate_payload(people, ca_people[:-1], "2026-09-17")
    with pytest.raises(RuntimeError):
        validate_payload(people, ca_people, "2026-09-16", latest_snapshot_date="2026-09-17")


def test_callers_filter_california_from_full_forbes_payload():
    with patch("urllib.request.urlopen", return_value=make_mock_response(MOCK_RESPONSE)):
        people, *_ = fetch_forbes_people()

    ca_names = [p["personName"] for p in people if p.get("state") == "California"]

    assert ca_names == ["Larry Page", "Sergey Jr Brin", "Ken Xie & family"]
    assert "Elon Musk" not in ca_names


def test_canonicalize_name_keeps_forbes_display_names_except_aliases():
    assert canonicalize_name("Sergey Jr Brin") == "Sergey Brin"
    assert canonicalize_name("Ken Xie & family") == "Ken Xie & family"


def test_normalize_name_joins_across_family_suffix_case_and_aliases():
    assert normalize_name("Ken Xie & family") == normalize_name("Ken Xie")
    assert normalize_name("Sergey Jr Brin") == normalize_name("sergey brin")
    assert normalize_name("Archie Aldis Emmerson & family") == normalize_name(
        "Archie Aldis Emmerson"
    )


def test_build_row_converts_millions_applies_metadata_and_keeps_location():
    row = build_row(
        MOCK_RESPONSE["personList"]["personsLists"][0],
        rauh_re={normalize_name("Larry Page"): 101_500_000},
        metadata_by_name={normalize_name("Larry Page"): {"departureTiming": "pre_snapshot"}},
    )

    assert row["name"] == "Larry Page"
    assert row["netWorth"] == 233e9
    assert row["realEstate"] == 101_500_000
    assert row["moved"] is True
    assert row["departureTiming"] == "pre_snapshot"
    assert row["forbesUri"] == "larry-page"
    assert row["forbesState"] == "California"


def test_build_row_matches_real_estate_across_family_suffix():
    row = build_row(
        MOCK_RESPONSE["personList"]["personsLists"][3],
        rauh_re={normalize_name("Ken Xie"): 59_600_000},
        metadata_by_name={},
    )

    assert row["name"] == "Ken Xie & family"
    assert row["realEstate"] == 59_600_000


def test_augment_tracked_departures_adds_missing_tracked_people_from_full_payload():
    metadata = {"Sergey Brin": {"departureTiming": "pre_snapshot"}}
    people = MOCK_RESPONSE["personList"]["personsLists"]

    augmented = augment_tracked_departures(
        [], people, rauh_re={}, metadata=metadata, fallback_rows={}
    )

    assert len(augmented) == 1
    assert augmented[0]["name"] == "Sergey Brin"
    assert augmented[0]["includeInRawForbes"] is False
    assert augmented[0]["departureTiming"] == "pre_snapshot"


def test_augment_tracked_departures_does_not_duplicate_a_present_person():
    metadata = {"Ken Xie": {"departureTiming": "unconfirmed"}}
    people = MOCK_RESPONSE["personList"]["personsLists"]
    rows = [build_row(people[3], {}, {normalize_name("Ken Xie"): metadata["Ken Xie"]})]

    augmented = augment_tracked_departures(rows, people, {}, metadata, {})

    assert [row["name"] for row in augmented] == ["Ken Xie & family"]


def test_build_roster_valuations_values_roster_members_in_any_state():
    people = MOCK_RESPONSE["personList"]["personsLists"]
    roster = [
        {"name": "Elon Musk", "netWorth": 400e9},
        {"name": "Ken Xie", "netWorth": 5.64e9},
        {"name": "Fell Below", "netWorth": 1.2e9},
    ]

    valuations = build_roster_valuations(people, roster)

    assert valuations["Elon Musk"]["netWorth"] == 827e9
    assert valuations["Elon Musk"]["forbesState"] == "Texas"
    assert valuations["Ken Xie"]["netWorth"] == 11.55e9
    assert "Fell Below" not in valuations


def test_summarize_rows_reports_raw_and_departure_totals():
    rows = [
        {"name": "Resident", "netWorth": 2e9, "includeInRawForbes": True, "excludeFromCorrectedBase": False, "departureTiming": None},
        {"name": "Departed", "netWorth": 3e9, "includeInRawForbes": True, "excludeFromCorrectedBase": False, "departureTiming": "pre_snapshot"},
        {"name": "Corrected out", "netWorth": 4e9, "includeInRawForbes": True, "excludeFromCorrectedBase": True, "departureTiming": None},
    ]

    summary = summarize_rows(rows)

    assert summary["raw_count"] == 3
    assert summary["raw_wealth"] == 9e9
    assert summary["corrected_count"] == 2
    assert summary["corrected_wealth"] == 5e9
    assert summary["pre_snapshot_count"] == 1
    assert summary["pre_snapshot_wealth"] == 3e9
