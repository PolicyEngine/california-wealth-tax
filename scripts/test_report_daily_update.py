"""Tests for the daily update's outage report."""

import itertools
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from check_snapshot_freshness import MAX_SNAPSHOT_AGE_DAYS  # noqa: E402
from report_daily_update import (  # noqa: E402
    ISSUE_TITLE,
    MENTION_AFTER_DAYS_OPEN,
    MENTION_MARKER,
    REMIND_EVERY_DAYS,
    Context,
    GitHub,
    main,
    report_failure,
    report_success,
    should_mention,
)

TODAY = date(2026, 10, 21)


def days_ago(days):
    return TODAY - timedelta(days=days)


class FakeGitHub:
    def __init__(self, opened=None, last_mention=None, source_date="2026-10-18"):
        self.issue = None if opened is None else (20, opened)
        self.last_mention = last_mention
        self._source_date = source_date
        self.writes = []

    def open_issue(self):
        return self.issue

    def last_mention_date(self, issue):
        return self.last_mention

    def source_date(self):
        if isinstance(self._source_date, Exception):
            raise self._source_date
        return self._source_date

    def create_issue(self, body, assignee):
        self.writes.append(("create", body, assignee))

    def comment(self, issue, body):
        self.writes.append(("comment", issue, body))

    def close_issue(self, issue, comment):
        self.writes.append(("close", issue, comment))


def context(**overrides):
    fields = dict(
        repo="PolicyEngine/california-wealth-tax",
        branch="main",
        run_url="https://github.com/PolicyEngine/california-wealth-tax/actions/runs/1",
        assignee="maintainer",
    )
    return Context(**{**fields, **overrides})


def test_the_first_mention_comes_when_pre_outage_data_turns_stale():
    # Last good run on day 0, issue opened on day 1: the first mention goes out
    # on day 1 + MENTION_AFTER_DAYS_OPEN, the first day day-0 data is too old.
    assert 1 + MENTION_AFTER_DAYS_OPEN == MAX_SNAPSHOT_AGE_DAYS + 1


def test_a_first_failure_opens_an_assigned_issue():
    github = FakeGitHub()

    report_failure(github, context(), TODAY)

    [(action, body, assignee)] = github.writes
    assert action == "create"
    assert assignee == "maintainer"
    assert "actions/runs/1 failed before publishing" in body
    assert "keeps the data from 2026-10-18" in body


def test_a_failed_dispatch_after_publishing_says_the_data_is_out():
    github = FakeGitHub()

    report_failure(github, context(data_commit="abc123"), TODAY)

    [(_, body, _)] = github.writes
    assert "pushed data commit abc123 to main but could not start CI" in body
    assert "before publishing" not in body


def test_a_ci_failure_names_the_data_commit_and_the_ci_run():
    github = FakeGitHub()

    report_failure(github, context(data_commit="abc123"), TODAY, ci_failed=True)

    [(_, body, _)] = github.writes
    assert body.startswith(
        "CI run https://github.com/PolicyEngine/california-wealth-tax/actions/runs/1"
        " on main, dispatched for data commit abc123, failed."
    )


def test_an_unreadable_source_date_still_opens_the_issue():
    github = FakeGitHub(source_date=subprocess.CalledProcessError(1, ["gh", "api"]))

    report_failure(github, context(), TODAY)

    [(action, body, _)] = github.writes
    assert action == "create"
    assert "an unknown date" in body


@pytest.mark.parametrize("days_open", range(MENTION_AFTER_DAYS_OPEN))
def test_an_open_issue_stays_quiet_early_in_an_outage(days_open):
    github = FakeGitHub(opened=days_ago(days_open))

    report_failure(github, context(), TODAY)

    assert github.writes == []


def test_an_outage_that_runs_on_mentions_the_assignee():
    github = FakeGitHub(opened=days_ago(MENTION_AFTER_DAYS_OPEN))

    report_failure(github, context(), TODAY)

    [(action, issue, body)] = github.writes
    assert (action, issue) == ("comment", 20)
    opened = days_ago(MENTION_AFTER_DAYS_OPEN).isoformat()
    assert body.startswith(
        "@maintainer no daily Forbes update has succeeded since this issue "
        f"opened on {opened}, {MENTION_AFTER_DAYS_OPEN} days ago."
    )
    assert "main has data from 2026-10-18" in body
    assert MENTION_MARKER in body


def test_mentions_repeat_weekly_not_daily():
    quiet = FakeGitHub(
        opened=days_ago(12), last_mention=days_ago(REMIND_EVERY_DAYS - 1)
    )
    due = FakeGitHub(opened=days_ago(12), last_mention=days_ago(REMIND_EVERY_DAYS))

    report_failure(quiet, context(), TODAY)
    report_failure(due, context(), TODAY)

    assert quiet.writes == []
    assert [write[0] for write in due.writes] == ["comment"]


def test_success_closes_the_open_issue():
    github = FakeGitHub(opened=days_ago(4), source_date="2026-10-21")

    report_success(github, context())

    [(action, issue, comment)] = github.writes
    assert (action, issue) == ("close", 20)
    assert "succeeded, and main has data from 2026-10-21" in comment


def test_success_without_an_issue_writes_nothing():
    github = FakeGitHub()

    report_success(github, context())

    assert github.writes == []


def mentions(run_days):
    """Days a failing outage mentions the assignee, given the days it runs.

    The issue opened on day 0. run_days is sorted and may repeat a day, as a
    rerun or a ci.yml report on the same day does.
    """
    mentioned = []
    for day in run_days:
        since = day - mentioned[-1] if mentioned else None
        if should_mention(day, since):
            mentioned.append(day)
    return mentioned


def test_a_daily_outage_is_mentioned_on_day_2_then_weekly():
    assert mentions(range(1, 31)) == [2, 9, 16, 23, 30]


def test_mention_schedule_for_every_pattern_of_missed_and_repeated_runs():
    """For every way failing runs can fall on days 1-12: none, one or two a day.

    - nothing is said before day MENTION_AFTER_DAYS_OPEN;
    - two mentions are never closer than REMIND_EVERY_DAYS;
    - the first run once a mention is due always makes it, so a missed run
      delays a mention by at most the gap to the next run.
    """
    horizon = 12
    for runs in itertools.product((0, 1, 2), repeat=horizon):
        run_days = [
            day for day, count in zip(range(1, horizon + 1), runs) for _ in range(count)
        ]
        said = mentions(run_days)

        assert all(day >= MENTION_AFTER_DAYS_OPEN for day in said)
        assert all(b - a >= REMIND_EVERY_DAYS for a, b in zip(said, said[1:]))
        expected, due = [], MENTION_AFTER_DAYS_OPEN
        for day in run_days:
            if day >= due:
                expected.append(day)
                due = day + REMIND_EVERY_DAYS
        assert said == expected


def fake_gh(responses):
    """A subprocess.run stand-in that answers gh calls by URL fragment."""
    calls = []

    def run(args, **kwargs):
        calls.append(args)
        for fragment, stdout in responses.items():
            if any(fragment in arg for arg in args):
                return SimpleNamespace(stdout=stdout)
        raise AssertionError(f"unexpected gh call: {args}")

    return run, calls


def test_github_reads_parse_gh_output():
    run, _ = fake_gh(
        {
            "issues?state=open": "31 2026-10-19T12:15:00Z\n20 2026-09-20T12:13:38Z\n",
            "/comments": "2026-10-01T12:00:00Z\n2026-10-08T12:00:00Z\n",
            "billionaires_live_meta.json": '{"sourceDate": "2026-10-18"}',
        }
    )
    github = GitHub("PolicyEngine/california-wealth-tax", "main", run=run)

    assert github.open_issue() == (20, date(2026, 9, 20))
    assert github.last_mention_date(20) == date(2026, 10, 8)
    assert github.source_date() == "2026-10-18"


def test_github_reads_handle_empty_results():
    run, _ = fake_gh({"issues?state=open": "", "/comments": ""})
    github = GitHub("PolicyEngine/california-wealth-tax", "main", run=run)

    assert github.open_issue() is None
    assert github.last_mention_date(20) is None


def test_issue_lookup_matches_the_exact_title_and_skips_pull_requests():
    run, calls = fake_gh({"issues?state=open": ""})

    GitHub("PolicyEngine/california-wealth-tax", "main", run=run).open_issue()

    jq = calls[0][calls[0].index("--jq") + 1]
    assert "select(.pull_request == null)" in jq
    assert f'select(.title == "{ISSUE_TITLE}")' in jq


def test_dry_run_reads_but_does_not_write(capsys):
    run, calls = fake_gh({})
    github = GitHub("PolicyEngine/california-wealth-tax", "main", True, run=run)

    github.create_issue("body", "maintainer")
    github.comment(20, "body")
    github.close_issue(20, "done")

    assert calls == []
    printed = capsys.readouterr().out
    assert "would run: gh issue create" in printed
    assert "--assignee maintainer" in printed
    assert "would run: gh issue close 20" in printed


@pytest.mark.parametrize(
    "outcome, expected",
    [
        ("failure", "failed before publishing"),
        ("ci-failure", "dispatched for data commit abc123, failed"),
    ],
)
def test_main_routes_each_outcome(monkeypatch, outcome, expected):
    github = FakeGitHub()
    monkeypatch.setattr("report_daily_update.GitHub", lambda *a, **k: github)
    for name, value in {
        "GITHUB_REPOSITORY": "PolicyEngine/california-wealth-tax",
        "GITHUB_REF_NAME": "main",
        "GITHUB_RUN_ID": "7",
        "DATA_COMMIT": "abc123" if outcome == "ci-failure" else "",
    }.items():
        monkeypatch.setenv(name, value)

    main([outcome])

    [(action, body, assignee)] = github.writes
    assert action == "create"
    assert expected in body
    assert assignee == "MaxGhenis"
