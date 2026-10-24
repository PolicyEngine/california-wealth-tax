"""Tests for the Forbes snapshot fetcher."""

import http.client
import itertools
import json
import ssl
import sys
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent))

import fetch_forbes  # noqa: E402
from fetch_forbes import (  # noqa: E402
    FORBES_FETCH_ATTEMPTS,
    FORBES_RETRY_BASE_SECONDS,
    MIN_CALIFORNIA_PEOPLE,
    MIN_FORBES_PEOPLE,
    augment_tracked_departures,
    build_roster_valuations,
    build_row,
    canonicalize_name,
    check_payload_complete,
    fetch_forbes_people,
    is_transient_fetch_error,
    last_listed_valuations,
    load_fallback_rows,
    normalize_name,
    read_forbes_json,
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


FORBES_URL_FOR_TESTS = "https://www.forbes.com/forbesapi/test.json"


def http_error(code):
    return urllib.error.HTTPError(FORBES_URL_FOR_TESTS, code, "error", {}, None)


class FakeResponse:
    """A urlopen response whose read() returns a body or raises an error."""

    def __init__(self, body=None, error=None):
        self.body = body
        self.error = error
        self.exited = False

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        self.exited = True
        return False

    def read(self):
        if self.error is not None:
            raise self.error
        return self.body


OK_BODY = json.dumps(MOCK_RESPONSE).encode()

# What one request does, and whether a retry should follow it. "open" outcomes
# make urlopen raise; "read" outcomes return a response whose read() raises or
# returns a body that json.loads rejects, as truncated and error-page responses
# do in production.
FETCH_OUTCOMES = {
    "ok": ("read", lambda: None, None),
    "503": ("open", lambda: http_error(503), True),
    "429": ("open", lambda: http_error(429), True),
    "404": ("open", lambda: http_error(404), False),
    "no-connection": ("open", lambda: urllib.error.URLError("unreachable"), True),
    "connect-timeout": ("open", lambda: TimeoutError("timed out"), True),
    "connect-reset": ("open", lambda: ConnectionResetError("reset"), True),
    "bad-status": ("open", lambda: http.client.BadStatusLine("HTTP/9"), True),
    "read-truncated": ("read", lambda: http.client.IncompleteRead(b"{", 10), True),
    "read-timeout": ("read", lambda: TimeoutError("timed out"), True),
    "read-reset": ("read", lambda: ConnectionResetError("reset"), True),
    "read-tls": ("read", lambda: ssl.SSLError("bad record mac"), True),
    "read-not-json": ("read", lambda: b"<html>503 first byte timeout</html>", True),
    "read-cut-utf8": ("read", lambda: b'{"personName": "Jos\xc3', True),
    "read-other": ("read", lambda: RuntimeError("unexpected"), False),
}


def run_fetch(outcomes, attempts):
    """Run read_forbes_json against scripted outcomes; return what happened."""
    calls, waits, raised, responses = [], [], [], []

    def fake_urlopen(req, timeout):
        calls.append(None)
        if len(calls) > len(outcomes):
            pytest.fail(f"request {len(calls)} exceeds the scripted {outcomes}")
        if timeout != 60:
            pytest.fail(f"request timeout is {timeout}, expected 60 seconds")
        name = outcomes[len(calls) - 1]
        phase, make, _ = FETCH_OUTCOMES[name]
        made = make()
        if phase == "open":
            raised.append(made)
            raise made
        if name == "ok":
            response = FakeResponse(body=OK_BODY)
        elif isinstance(made, bytes):
            response = FakeResponse(body=made)
        else:
            raised.append(made)
            response = FakeResponse(error=made)
        responses.append(response)
        return response

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        try:
            result = read_forbes_json(
                object(), attempts=attempts, sleep=waits.append
            )
        except Exception as error:  # noqa: BLE001 - the test inspects any raise
            outcome = ("raise", error, raised[-1] if raised else None)
        else:
            outcome = ("ok", result, None)
    return len(calls), waits, responses, outcome


@pytest.mark.parametrize("attempts", [1, 2, 3, FORBES_FETCH_ATTEMPTS])
def test_read_forbes_json_retries_exactly_the_transient_failures(attempts):
    """Every sequence of request outcomes, against a reference model.

    Invariants: at most `attempts` requests; a non-transient failure stops at
    once; the payload comes back iff an "ok" arrives before that; waits double
    from the base and none follows the last request; a failure re-raises the
    last request's own error; every response urlopen returns is closed.
    """
    for outcomes in itertools.product(FETCH_OUTCOMES, repeat=attempts):
        calls, waits, responses, (kind, value, last_error) = run_fetch(
            outcomes, attempts
        )

        expected_calls = attempts
        for k, name in enumerate(outcomes, start=1):
            if name == "ok" or not FETCH_OUTCOMES[name][2]:
                expected_calls = k
                break
        assert calls == expected_calls, outcomes
        assert waits == [
            FORBES_RETRY_BASE_SECONDS * 2**i for i in range(expected_calls - 1)
        ], outcomes
        assert all(response.exited for response in responses), outcomes

        last = outcomes[expected_calls - 1]
        if last == "ok":
            assert kind == "ok", outcomes
            assert value == MOCK_RESPONSE, outcomes
        else:
            assert kind == "raise", outcomes
            if last == "read-not-json":
                assert isinstance(value, json.JSONDecodeError), outcomes
            elif last == "read-cut-utf8":
                assert isinstance(value, UnicodeDecodeError), outcomes
            else:
                assert value is last_error, outcomes


def test_is_transient_fetch_error_splits_server_and_client_errors():
    for code in range(400, 600):
        expected = code == 429 or code >= 500
        assert is_transient_fetch_error(http_error(code)) == expected, code
    assert is_transient_fetch_error(ssl.SSLError("bad record mac"))
    assert is_transient_fetch_error(http.client.RemoteDisconnected("closed"))
    assert is_transient_fetch_error(json.JSONDecodeError("bad", "<html>", 0))
    assert is_transient_fetch_error(
        UnicodeDecodeError("utf-8", b"\xc3", 0, 1, "unexpected end of data")
    )
    assert not is_transient_fetch_error(ValueError("not a fetch failure"))
    assert not is_transient_fetch_error(KeyError("personList"))


def test_fetch_forbes_people_uses_the_full_retry_budget(capsys):
    """Three 503s, then a good payload: four requests, waits of 30, 60, 120s."""
    responses = [http_error(503)] * 3 + [FakeResponse(body=OK_BODY)]
    with (
        patch("urllib.request.urlopen", side_effect=responses) as urlopen,
        patch.object(fetch_forbes.time, "sleep") as sleep,
    ):
        people, *_ = fetch_forbes_people()
    assert urlopen.call_count == 4
    assert [c.args[0] for c in sleep.call_args_list] == [30, 60, 120]
    assert len(people) == 4
    err = capsys.readouterr().err
    assert "retrying in 30s (attempt 2 of 4)" in err
    assert "retrying in 120s (attempt 4 of 4)" in err


def test_fetch_forbes_people_gives_up_after_the_retry_budget(capsys):
    with (
        patch("urllib.request.urlopen", side_effect=[http_error(503)] * 4) as urlopen,
        patch.object(fetch_forbes.time, "sleep") as sleep,
        pytest.raises(urllib.error.HTTPError) as raised,
    ):
        fetch_forbes_people()
    assert raised.value.code == 503
    assert urlopen.call_count == 4
    assert sleep.call_count == 3
    assert capsys.readouterr().err.count("retrying in") == 3


def test_fetch_forbes_people_recovers_from_a_first_byte_timeout():
    """The 2026-10-24 failure: a 503 from Forbes, which a retry got past."""
    responses = [http_error(503), FakeResponse(body=OK_BODY)]
    with (
        patch("urllib.request.urlopen", side_effect=responses) as urlopen,
        patch.object(fetch_forbes.time, "sleep") as sleep,
    ):
        people, source_date, *_ = fetch_forbes_people()
    assert urlopen.call_count == 2
    sleep.assert_called_once_with(FORBES_RETRY_BASE_SECONDS)
    assert len(people) == 4
    assert source_date == "2026-03-26"


def test_fetch_forbes_people_does_not_retry_a_client_error():
    with (
        patch("urllib.request.urlopen", side_effect=[http_error(404)]) as urlopen,
        patch.object(fetch_forbes.time, "sleep") as sleep,
        pytest.raises(urllib.error.HTTPError),
    ):
        fetch_forbes_people()
    assert urlopen.call_count == 1
    sleep.assert_not_called()


def test_fetch_forbes_people_rejects_an_empty_payload():
    empty = {"personList": {"personsLists": []}}
    with patch("urllib.request.urlopen", return_value=make_mock_response(empty)):
        with pytest.raises(RuntimeError):
            fetch_forbes_people()


def test_fetch_forbes_people_rejects_a_payload_shorter_than_forbes_reports():
    clipped = {"personList": {**MOCK_RESPONSE["personList"], "count": 5}}
    with patch("urllib.request.urlopen", return_value=make_mock_response(clipped)):
        with pytest.raises(RuntimeError, match="reports 5 people but returned 4"):
            fetch_forbes_people()


def test_check_payload_complete_rejects_a_list_that_fills_the_request_limit():
    people = MOCK_RESPONSE["personList"]["personsLists"]

    check_payload_complete(people, reported_count=4, limit=5)
    check_payload_complete(people, reported_count=None, limit=5)
    with pytest.raises(RuntimeError, match="request limit"):
        check_payload_complete(people, reported_count=4, limit=4)


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


def test_build_roster_valuations_carries_the_last_listed_value_for_people_forbes_dropped():
    people = MOCK_RESPONSE["personList"]["personsLists"]
    roster = [
        {"name": "Dropped Person & family", "netWorth": 11.4e9},
        {"name": "Never Stored", "netWorth": 1.2e9},
    ]
    last_listed = {normalize_name("Dropped Person"): ("2026-06-17", 12.0e9)}

    valuations = build_roster_valuations(people, roster, last_listed)

    assert valuations["Dropped Person & family"] == {
        "netWorth": 12.0e9,
        "lastListedDate": "2026-06-17",
    }
    assert "Never Stored" not in valuations


def write_snapshot(directory, date, rows):
    (directory / f"{date}.json").write_text(json.dumps(rows))


def test_last_listed_valuations_skips_fallback_rows_and_nonpositive_values(tmp_path):
    write_snapshot(tmp_path, "2026-02-01", [{"name": "A Person", "netWorth": 1.013e9}])
    write_snapshot(
        tmp_path,
        "2026-02-02",
        [
            {"name": "A Person", "netWorth": -0.016e9},
            {"name": "B Person & family", "netWorth": 3e9},
        ],
    )
    write_snapshot(
        tmp_path,
        "2026-02-03",
        [{"name": "B Person", "netWorth": 9e9, "includeInRawForbes": False}],
    )
    (tmp_path / "index.json").write_text("[]")

    last_listed = last_listed_valuations(tmp_path)

    assert last_listed[normalize_name("A Person")] == ("2026-02-01", 1.013e9)
    assert last_listed[normalize_name("B Person")] == ("2026-02-02", 3e9)


def test_load_fallback_rows_never_returns_a_synthetic_row(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    snapshots_dir = tmp_path / "snapshots"
    data_dir.mkdir()
    snapshots_dir.mkdir()
    synthetic = {"name": "Synthetic Person", "netWorth": 2e9}
    (data_dir / "billionaire_metadata.json").write_text(
        json.dumps({"byName": {}, "syntheticRowsBySnapshot": {"2025-10-17": [synthetic]}})
    )
    # An earlier fetcher wrote the synthetic row into daily snapshots.
    write_snapshot(
        snapshots_dir,
        "2026-03-26",
        [synthetic, {"name": "Real Person", "netWorth": 3e9}],
    )
    monkeypatch.setattr(fetch_forbes, "DATA_DIR", data_dir)
    monkeypatch.setattr(fetch_forbes, "SNAPSHOTS_DIR", snapshots_dir)

    fallback_rows = load_fallback_rows()

    assert normalize_name("Real Person") in fallback_rows
    assert normalize_name("Synthetic Person") not in fallback_rows


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


def test_merge_citizenship_only_ever_adds_names():
    table = {"jane doe": "Canada"}
    merged, added = fetch_forbes.merge_citizenship(
        table,
        [
            ("Jane Doe", "United States"),
            ("Ann Roe & family", "Germany"),
            ("No Record", None),
            (None, "France"),
        ],
    )

    assert merged == {"ann roe": "Germany", "jane doe": "Canada"}
    assert added == ["ann roe"]
    assert table == {"jane doe": "Canada"}


def test_update_citizenship_table_keeps_every_existing_entry(tmp_path):
    path = tmp_path / "citizenship_by_name.json"
    path.write_text(json.dumps({"note": "kept", "byKey": {"jane doe": "Canada"}}))

    added = fetch_forbes.update_citizenship_table([("New Person", "India")], path)
    again = fetch_forbes.update_citizenship_table([("Jane Doe", "Mexico")], path)
    stored = json.loads(path.read_text())

    assert added == ["new person"]
    assert again == []
    assert stored == {"note": "kept", "byKey": {"jane doe": "Canada", "new person": "India"}}

