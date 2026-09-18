"""Tests for the Forbes snapshot fetcher."""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent))

from fetch_forbes import (  # noqa: E402
    augment_tracked_departures,
    build_row,
    canonicalize_name,
    fetch_forbes_people,
    summarize_rows,
)


MOCK_RESPONSE = {
    "personList": {
        "personsLists": [
            {
                "uri": "larry-page",
                "personName": "Larry Page",
                "finalWorth": 233000.0,
                "state": "California",
                "city": "Palo Alto",
                "countryOfCitizenship": "United States",
                "timestamp": 1774511402160,
            },
            {
                "uri": "elon-musk",
                "personName": "Elon Musk",
                "finalWorth": 827000.0,
                "state": "Texas",
                "city": "Austin",
                "countryOfCitizenship": "United States",
                "timestamp": 1774511402160,
            },
            {
                "uri": "sergey-jr-brin",
                "personName": "Sergey Jr Brin",
                "finalWorth": 150000.0,
                "state": "California",
                "city": "Los Altos",
                "countryOfCitizenship": "United States",
                "timestamp": 1774511402160,
            },
        ]
    }
}


def make_mock_response(data):
    mock = MagicMock()
    mock.read.return_value = json.dumps(data).encode()
    mock.__enter__ = lambda s: s
    mock.__exit__ = MagicMock(return_value=False)
    return mock


def test_fetch_forbes_people_returns_payload_and_source_timestamp():
    with patch("urllib.request.urlopen", return_value=make_mock_response(MOCK_RESPONSE)):
        people, source_date, source_timestamp_ms, source_timestamp_iso = fetch_forbes_people()

    assert len(people) == 3
    assert people[0]["personName"] == "Larry Page"
    assert source_date == "2026-03-26"
    assert source_timestamp_ms == 1774511402160
    assert source_timestamp_iso == "2026-03-26T07:50:02.160000+00:00"


def test_callers_filter_california_from_full_forbes_payload():
    with patch("urllib.request.urlopen", return_value=make_mock_response(MOCK_RESPONSE)):
        people, *_ = fetch_forbes_people()

    ca_names = [person["personName"] for person in people if person.get("state") == "California"]

    assert ca_names == ["Larry Page", "Sergey Jr Brin"]
    assert "Elon Musk" not in ca_names


def test_canonicalize_name_deduplicates_forbes_aliases():
    assert canonicalize_name("Sergey Jr Brin") == "Sergey Brin"
    assert canonicalize_name("Larry Page") == "Larry Page"


def test_build_row_converts_millions_to_dollars_and_applies_metadata():
    person = MOCK_RESPONSE["personList"]["personsLists"][0]
    row = build_row(
        person,
        rauh_re={"Larry Page": 101_500_000},
        metadata_by_name={"Larry Page": {"departureTiming": "pre_snapshot"}},
    )

    assert row["name"] == "Larry Page"
    assert row["netWorth"] == 233e9
    assert row["realEstate"] == 101_500_000
    assert row["moved"] is True
    assert row["departureTiming"] == "pre_snapshot"


def test_augment_tracked_departures_adds_missing_tracked_people_from_full_payload():
    rows = []
    metadata_by_name = {"Sergey Brin": {"departureTiming": "pre_snapshot"}}
    people = MOCK_RESPONSE["personList"]["personsLists"]

    augmented = augment_tracked_departures(
        rows,
        people,
        rauh_re={},
        metadata_by_name=metadata_by_name,
        fallback_rows={},
    )

    assert len(augmented) == 1
    assert augmented[0]["name"] == "Sergey Brin"
    assert augmented[0]["includeInRawForbes"] is False
    assert augmented[0]["departureTiming"] == "pre_snapshot"


def test_summarize_rows_reports_raw_and_departure_totals():
    rows = [
        {
            "name": "Resident",
            "netWorth": 2e9,
            "includeInRawForbes": True,
            "excludeFromCorrectedBase": False,
            "departureTiming": None,
        },
        {
            "name": "Departed",
            "netWorth": 3e9,
            "includeInRawForbes": True,
            "excludeFromCorrectedBase": False,
            "departureTiming": "pre_snapshot",
        },
        {
            "name": "Corrected out",
            "netWorth": 4e9,
            "includeInRawForbes": True,
            "excludeFromCorrectedBase": True,
            "departureTiming": None,
        },
    ]

    summary = summarize_rows(rows)

    assert summary["raw_count"] == 3
    assert summary["raw_wealth"] == 9e9
    assert summary["corrected_count"] == 2
    assert summary["corrected_wealth"] == 5e9
    assert summary["pre_snapshot_count"] == 1
    assert summary["pre_snapshot_wealth"] == 3e9
