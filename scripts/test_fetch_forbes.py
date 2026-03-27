"""Tests for fetch_forbes.py — run with pytest."""

import json
import urllib.request
from unittest.mock import patch, MagicMock
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))
from fetch_forbes import fetch_forbes_ca, RAUH_DEPARTURES, FORBES_API


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
                "uri": "jensen-huang",
                "personName": "Jensen Huang",
                "finalWorth": 152500.0,
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


def test_fetch_forbes_ca_filters_california():
    with patch("urllib.request.urlopen", return_value=make_mock_response(MOCK_RESPONSE)):
        ca, date = fetch_forbes_ca()

    assert len(ca) == 2
    assert ca[0]["personName"] == "Larry Page"
    assert ca[1]["personName"] == "Jensen Huang"
    assert date == "2026-03-26"


def test_fetch_forbes_ca_excludes_non_california():
    with patch("urllib.request.urlopen", return_value=make_mock_response(MOCK_RESPONSE)):
        ca, _ = fetch_forbes_ca()

    names = [p["personName"] for p in ca]
    assert "Elon Musk" not in names


def test_rauh_departures_includes_known_movers():
    assert "Larry Page" in RAUH_DEPARTURES
    assert "Sergey Brin" in RAUH_DEPARTURES
    assert "Mark Zuckerberg" in RAUH_DEPARTURES
    assert "Jensen Huang" not in RAUH_DEPARTURES


def test_net_worth_conversion():
    """Forbes API returns millions; we store dollars."""
    with patch("urllib.request.urlopen", return_value=make_mock_response(MOCK_RESPONSE)):
        ca, _ = fetch_forbes_ca()

    # Larry Page: 233000 million = $233B
    assert ca[0]["finalWorth"] == 233000.0
    # Our script converts: finalWorth * 1e6 = dollars
    net_worth_dollars = ca[0]["finalWorth"] * 1e6
    assert net_worth_dollars == 233e9
