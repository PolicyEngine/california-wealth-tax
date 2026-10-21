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
    ESCALATE_AFTER_DAYS,
    ESCALATION_MARKER,
    ISSUE_TITLE,
    REMIND_EVERY_DAYS,
    Context,
    GitHub,
    report_failure,
    report_success,
    should_escalate,
)

TODAY = date(2026, 10, 21)


class FakeGitHub:
    def __init__(
        self,
        issue=None,
        last_success=None,
        last_escalation=None,
        source_date="2026-10-18",
    ):
        self.issue = issue
        self.last_success = last_success
        self.last_escalation = last_escalation
        self._source_date = source_date
        self.writes = []

    def open_issue(self):
        return self.issue

    def last_success_date(self):
        return self.last_success

    def last_escalation_date(self, issue):
        return self.last_escalation

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


def days_ago(days):
    return TODAY - timedelta(days=days)


def test_the_first_mention_comes_when_the_data_turns_stale():
    assert ESCALATE_AFTER_DAYS == MAX_SNAPSHOT_AGE_DAYS + 1


def test_a_first_failure_opens_an_assigned_issue():
    github = FakeGitHub()

    report_failure(github, context(), TODAY)

    [(action, body, assignee)] = github.writes
    assert action == "create"
    assert assignee == "maintainer"
    assert "actions/runs/1 failed before publishing" in body
    assert "keeps the data from 2026-10-18" in body


def test_a_failure_after_publishing_says_the_data_is_out():
    github = FakeGitHub()
    ctx = context(data_commit="abc123", ci_run_url="https://example.test/ci/2")

    report_failure(github, ctx, TODAY)

    [(_, body, _)] = github.writes
    assert "pushed data commit abc123" in body
    assert "CI on it (https://example.test/ci/2) did not pass" in body
    assert "before publishing" not in body


def test_an_unreadable_source_date_still_opens_the_issue():
    github = FakeGitHub(
        source_date=subprocess.CalledProcessError(1, ["gh", "api"]),
    )

    report_failure(github, context(), TODAY)

    [(action, body, _)] = github.writes
    assert action == "create"
    assert "an unknown date" in body


@pytest.mark.parametrize("days_down", range(ESCALATE_AFTER_DAYS))
def test_an_open_issue_stays_quiet_early_in_an_outage(days_down):
    github = FakeGitHub(issue=20, last_success=days_ago(days_down))

    report_failure(github, context(), TODAY)

    assert github.writes == []


def test_an_outage_that_runs_on_mentions_the_assignee():
    github = FakeGitHub(issue=20, last_success=days_ago(ESCALATE_AFTER_DAYS))

    report_failure(github, context(), TODAY)

    [(action, issue, body)] = github.writes
    assert (action, issue) == ("comment", 20)
    assert body.startswith("@maintainer the daily Forbes update has not succeeded")
    since = days_ago(ESCALATE_AFTER_DAYS).isoformat()
    assert f"for {ESCALATE_AFTER_DAYS} days, since {since}" in body
    assert ESCALATION_MARKER in body


def test_mentions_repeat_weekly_not_daily():
    quiet = FakeGitHub(
        issue=20,
        last_success=days_ago(12),
        last_escalation=days_ago(REMIND_EVERY_DAYS - 1),
    )
    due = FakeGitHub(
        issue=20,
        last_success=days_ago(12),
        last_escalation=days_ago(REMIND_EVERY_DAYS),
    )

    report_failure(quiet, context(), TODAY)
    report_failure(due, context(), TODAY)

    assert quiet.writes == []
    assert [write[0] for write in due.writes] == ["comment"]


def test_no_success_on_record_counts_as_a_long_outage():
    github = FakeGitHub(issue=20, last_success=None)

    report_failure(github, context(), TODAY)

    [(_, _, body)] = github.writes
    assert "has no successful run on record" in body


def test_success_closes_the_open_issue():
    github = FakeGitHub(issue=20, source_date="2026-10-21")

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

    The last success was day 0. run_days is sorted and may repeat a day, as a
    rerun does.
    """
    mentioned = []
    for day in run_days:
        since = day - mentioned[-1] if mentioned else None
        if should_escalate(day, since):
            mentioned.append(day)
    return mentioned


def test_a_daily_outage_is_mentioned_on_day_3_then_weekly():
    assert mentions(range(1, 32)) == [3, 10, 17, 24, 31]


def test_mention_schedule_for_every_pattern_of_missed_and_repeated_runs():
    """For every way the job can run on days 1-12: not at all, once or twice.

    - nothing is said before day ESCALATE_AFTER_DAYS;
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

        assert all(day >= ESCALATE_AFTER_DAYS for day in said)
        assert all(b - a >= REMIND_EVERY_DAYS for a, b in zip(said, said[1:]))
        expected, due = [], ESCALATE_AFTER_DAYS
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
            "issues?state=open": "31\n20\n",
            "/runs?branch=main&status=success": "2026-10-18T12:14:48Z\n",
            "/comments": "2026-10-01T12:00:00Z\n2026-10-08T12:00:00Z\n",
            "billionaires_live_meta.json": '{"sourceDate": "2026-10-18"}',
        }
    )
    github = GitHub("PolicyEngine/california-wealth-tax", "main", run=run)

    assert github.open_issue() == 20
    assert github.last_success_date() == date(2026, 10, 18)
    assert github.last_escalation_date(20) == date(2026, 10, 8)
    assert github.source_date() == "2026-10-18"


def test_github_reads_handle_empty_results():
    run, _ = fake_gh({"issues?state=open": "", "/runs?": "", "/comments": ""})
    github = GitHub("PolicyEngine/california-wealth-tax", "main", run=run)

    assert github.open_issue() is None
    assert github.last_success_date() is None
    assert github.last_escalation_date(20) is None


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
