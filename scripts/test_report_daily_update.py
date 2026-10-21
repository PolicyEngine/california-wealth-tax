"""Tests for the daily update's outage report."""

import itertools
import json
import shutil
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).parent))

import check_snapshot_freshness  # noqa: E402
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
NOON = datetime(2026, 10, 21, 12, tzinfo=timezone.utc)


def days_ago(days):
    return NOON - timedelta(days=days)


class FakeGitHub:
    def __init__(
        self,
        issues=(),
        last_mention=None,
        source_date="2026-10-18",
        commit_time=None,
        assign_error=None,
    ):
        self.issues = sorted(issues)
        self.last_mention = last_mention
        self._source_date = source_date
        self._commit_time = commit_time
        self.assign_error = assign_error
        self.writes = []

    def open_issues(self):
        return self.issues

    def last_mention_time(self, issue):
        return self.last_mention

    def commit_time(self, sha):
        if isinstance(self._commit_time, Exception):
            raise self._commit_time
        return self._commit_time

    def source_date(self):
        if isinstance(self._source_date, Exception):
            raise self._source_date
        return self._source_date

    def create_issue(self, body):
        self.writes.append(("create", body))

    def assign(self, issue, assignee):
        if self.assign_error:
            raise self.assign_error
        self.writes.append(("assign", issue, assignee))

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


def freshness_check_fails(source_date, today, tmp_path, monkeypatch):
    meta = tmp_path / "meta.json"
    meta.write_text(json.dumps({"sourceDate": source_date.isoformat()}))

    class Today(date):
        @classmethod
        def today(cls):
            return today

    monkeypatch.setattr(check_snapshot_freshness, "META_PATH", meta)
    monkeypatch.setattr(check_snapshot_freshness, "date", Today)
    try:
        check_snapshot_freshness.main([])
    except SystemExit:
        return True
    return False


def test_the_first_mention_comes_on_the_first_stale_day(tmp_path, monkeypatch):
    last_good = date(2026, 10, 1)
    opened = last_good + timedelta(days=1)
    first_mention = opened + timedelta(days=MENTION_AFTER_DAYS_OPEN)
    day_before = first_mention - timedelta(days=1)

    assert freshness_check_fails(last_good, first_mention, tmp_path, monkeypatch)
    assert not freshness_check_fails(last_good, day_before, tmp_path, monkeypatch)


def test_a_first_failure_opens_an_unassigned_issue():
    github = FakeGitHub()

    report_failure(github, context(), TODAY)

    [(action, body)] = github.writes
    assert action == "create"
    assert "actions/runs/1 failed before publishing" in body
    assert "keeps the data from 2026-10-18" in body
    assert "@maintainer" not in body
    assert f"still open after {MENTION_AFTER_DAYS_OPEN} days" in body


def test_a_failed_dispatch_after_publishing_says_the_data_is_out():
    github = FakeGitHub()

    report_failure(github, context(data_commit="abc123"), TODAY)

    [(_, body)] = github.writes
    assert "pushed data commit abc123 to main but could not start CI" in body
    assert "before publishing" not in body


def test_a_ci_failure_names_the_data_commit_and_the_ci_run():
    github = FakeGitHub()

    report_failure(github, context(data_commit="abc123"), TODAY, ci_failed=True)

    [(_, body)] = github.writes
    assert body.startswith(
        "CI run https://github.com/PolicyEngine/california-wealth-tax/actions/runs/1"
        " on main, dispatched for data commit abc123, failed."
    )


def test_an_unreadable_source_date_still_opens_the_issue():
    github = FakeGitHub(source_date=subprocess.CalledProcessError(1, ["gh", "api"]))

    report_failure(github, context(), TODAY)

    [(action, body)] = github.writes
    assert action == "create"
    assert "an unknown date" in body


@pytest.mark.parametrize("days_open", range(MENTION_AFTER_DAYS_OPEN))
def test_an_open_issue_stays_quiet_early_in_an_outage(days_open):
    github = FakeGitHub(issues=[(20, days_ago(days_open))])

    report_failure(github, context(), TODAY)

    assert github.writes == []


def test_an_outage_that_runs_on_assigns_and_mentions_the_assignee():
    github = FakeGitHub(issues=[(20, days_ago(MENTION_AFTER_DAYS_OPEN))])

    report_failure(github, context(), TODAY)

    [assign, (action, issue, body)] = github.writes
    assert assign == ("assign", 20, "maintainer")
    assert (action, issue) == ("comment", 20)
    opened = days_ago(MENTION_AFTER_DAYS_OPEN).date().isoformat()
    assert body.startswith(
        "@maintainer no daily Forbes update has succeeded since this issue "
        f"opened on {opened}, {MENTION_AFTER_DAYS_OPEN} days ago."
    )
    assert "main has data from 2026-10-18" in body
    assert MENTION_MARKER in body


def test_a_failed_assignment_still_mentions():
    github = FakeGitHub(
        issues=[(20, days_ago(MENTION_AFTER_DAYS_OPEN))],
        assign_error=subprocess.CalledProcessError(1, ["gh", "issue", "edit"]),
    )

    report_failure(github, context(), TODAY)

    [(action, _, body)] = github.writes
    assert action == "comment"
    assert body.startswith("@maintainer")


def test_mentions_repeat_weekly_not_daily():
    quiet = FakeGitHub(
        issues=[(20, days_ago(12))], last_mention=days_ago(REMIND_EVERY_DAYS - 1)
    )
    due = FakeGitHub(
        issues=[(20, days_ago(12))], last_mention=days_ago(REMIND_EVERY_DAYS)
    )

    report_failure(quiet, context(), TODAY)
    report_failure(due, context(), TODAY)

    assert quiet.writes == []
    assert [write[0] for write in due.writes] == ["assign", "comment"]


def test_a_failure_with_duplicate_issues_reports_on_the_oldest():
    github = FakeGitHub(
        issues=[(31, days_ago(0)), (20, days_ago(MENTION_AFTER_DAYS_OPEN))]
    )

    report_failure(github, context(), TODAY)

    assert [write[:2] for write in github.writes] == [("assign", 20), ("comment", 20)]


def test_success_closes_every_open_issue():
    github = FakeGitHub(
        issues=[(20, days_ago(4)), (31, days_ago(4))], source_date="2026-10-21"
    )

    report_success(github, context())

    assert [write[:2] for write in github.writes] == [("close", 20), ("close", 31)]
    assert "succeeded, and main has data from 2026-10-21" in github.writes[0][2]


def test_a_ci_pass_leaves_an_issue_opened_after_its_data_commit():
    github = FakeGitHub(
        issues=[(20, days_ago(3)), (31, days_ago(0))],
        commit_time=days_ago(1),
    )

    report_success(github, context(data_commit="abc123"))

    assert [write[:2] for write in github.writes] == [("close", 20)]


def test_an_undatable_data_commit_closes_every_issue():
    github = FakeGitHub(
        issues=[(20, days_ago(3)), (31, days_ago(0))],
        commit_time=subprocess.CalledProcessError(1, ["gh", "api"]),
    )

    report_success(github, context(data_commit="abc123"))

    assert [write[:2] for write in github.writes] == [("close", 20), ("close", 31)]


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
            "/commits/abc123": "2026-10-21T12:15:00Z\n",
            "billionaires_live_meta.json": '{"sourceDate": "2026-10-18"}',
        }
    )
    github = GitHub("PolicyEngine/california-wealth-tax", "main", run=run)

    assert github.open_issues() == [
        (20, datetime(2026, 9, 20, 12, 13, 38, tzinfo=timezone.utc)),
        (31, datetime(2026, 10, 19, 12, 15, tzinfo=timezone.utc)),
    ]
    assert github.last_mention_time(20) == datetime(
        2026, 10, 8, 12, tzinfo=timezone.utc
    )
    assert github.commit_time("abc123") == datetime(
        2026, 10, 21, 12, 15, tzinfo=timezone.utc
    )
    assert github.source_date() == "2026-10-18"


def test_github_reads_handle_empty_results():
    run, _ = fake_gh({"issues?state=open": "", "/comments": ""})
    github = GitHub("PolicyEngine/california-wealth-tax", "main", run=run)

    assert github.open_issues() == []
    assert github.last_mention_time(20) is None


def jq_filter(read):
    """The jq program a GitHub read passes to gh."""
    run, calls = fake_gh({"": ""})
    read(GitHub("PolicyEngine/california-wealth-tax", "main", run=run))
    return calls[0][calls[0].index("--jq") + 1]


def run_jq(program, data):
    result = subprocess.run(
        ["jq", "-r", program],
        input=json.dumps(data),
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.splitlines()


requires_jq = pytest.mark.skipif(shutil.which("jq") is None, reason="needs jq")


@requires_jq
def test_issue_filter_keeps_only_exact_title_issues():
    issues = [
        {"number": 20, "title": ISSUE_TITLE, "created_at": "2026-09-20T12:13:38Z"},
        {"number": 21, "title": ISSUE_TITLE, "pull_request": {}, "created_at": "x"},
        {"number": 22, "title": f"Re: {ISSUE_TITLE}", "created_at": "x"},
        {"number": 23, "title": ISSUE_TITLE.lower(), "created_at": "x"},
    ]

    rows = run_jq(jq_filter(GitHub.open_issues), issues)

    assert rows == ["20 2026-09-20T12:13:38Z"]


@requires_jq
def test_mention_filter_keeps_only_the_bots_marked_comments():
    bot, human = {"login": "github-actions[bot]"}, {"login": "MaxGhenis"}
    comments = [
        {"user": bot, "body": f"@x mention\n{MENTION_MARKER}", "created_at": "a"},
        {"user": bot, "body": "Closing.", "created_at": "b"},
        {"user": human, "body": f"quoting {MENTION_MARKER}", "created_at": "c"},
    ]

    rows = run_jq(jq_filter(lambda github: github.last_mention_time(20)), comments)

    assert rows == ["a"]


def test_dry_run_reads_but_does_not_write(capsys):
    run, calls = fake_gh({})
    github = GitHub("PolicyEngine/california-wealth-tax", "main", True, run=run)

    github.create_issue("body")
    github.assign(20, "maintainer")
    github.comment(20, "body")
    github.close_issue(20, "done")

    assert calls == []
    printed = capsys.readouterr().out
    assert "would run: gh issue create" in printed
    assert "would run: gh issue edit 20" in printed
    assert "--add-assignee maintainer" in printed
    assert "would run: gh issue close 20" in printed


@pytest.mark.parametrize(
    "outcome, issues, expected",
    [
        ("failure", [], ("create", "failed before publishing")),
        ("ci-failure", [], ("create", "dispatched for data commit abc123, failed")),
        ("success", [(20, NOON)], ("close", "succeeded")),
    ],
)
def test_main_routes_each_outcome(monkeypatch, outcome, issues, expected):
    github = FakeGitHub(issues=issues, commit_time=NOON)
    monkeypatch.setattr("report_daily_update.GitHub", lambda *a, **k: github)
    for name, value in {
        "GITHUB_REPOSITORY": "PolicyEngine/california-wealth-tax",
        "GITHUB_REF_NAME": "main",
        "GITHUB_RUN_ID": "7",
        "DATA_COMMIT": "" if outcome == "failure" else "abc123",
    }.items():
        monkeypatch.setenv(name, value)

    main([outcome])

    [write] = github.writes
    action, text = expected
    assert write[0] == action
    assert text in write[-1]
