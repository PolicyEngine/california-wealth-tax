"""Report the daily Forbes update's outcome on a GitHub issue.

The repository had no watchers in October 2026, so an issue the workflow opens
notified no one unless it named someone. From September 20 to October 20 the
daily job failed every day; it opened one unassigned issue on the first day
and said nothing after that. This script keeps one issue per outage and points
it at a person:

- the first failure opens the issue, assigned to ALERT_ASSIGNEE;
- once the issue has been open MENTION_AFTER_DAYS_OPEN days, a comment
  mentions the assignee, and another follows every REMIND_EVERY_DAYS while
  the outage lasts;
- the next good run closes the issue, so an open issue always means an outage
  that is still going on, and its age is the outage's length.

A daily run is good when it publishes nothing new or CI passes on the data
commit it published. update-forbes.yml reports its own failures and its runs
that publish nothing; ci.yml reports the CI result on each data commit.

    python3 scripts/report_daily_update.py failure      # update-forbes.yml
    python3 scripts/report_daily_update.py ci-failure   # ci.yml
    python3 scripts/report_daily_update.py success      # either

It reads GITHUB_REPOSITORY, GITHUB_REF_NAME, GITHUB_SERVER_URL, GITHUB_RUN_ID
and, once a data commit is pushed, DATA_COMMIT; gh reads GH_TOKEN. With
--dry-run it still reads from GitHub but prints the writes instead of making
them.
"""

import argparse
import json
import os
import shlex
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from check_snapshot_freshness import MAX_SNAPSHOT_AGE_DAYS  # noqa: E402

ISSUE_TITLE = "Daily Forbes update failed"
ALERT_ASSIGNEE = "MaxGhenis"
META_PATH = "data/billionaires_live_meta.json"
BOT_LOGIN = "github-actions[bot]"
# If the last good run was the day before the issue opened, its data is too old
# for check_snapshot_freshness.py by the time the first mention goes out.
MENTION_AFTER_DAYS_OPEN = MAX_SNAPSHOT_AGE_DAYS
REMIND_EVERY_DAYS = 7
MENTION_MARKER = "<!-- daily-update-mention -->"


def should_mention(days_open, days_since_mention):
    """Whether a failing run should mention the assignee.

    days_open counts days since the outage issue opened. days_since_mention
    counts days since the issue's last mention, or is None when it has none.
    """
    if days_open < MENTION_AFTER_DAYS_OPEN:
        return False
    return days_since_mention is None or days_since_mention >= REMIND_EVERY_DAYS


@dataclass
class Context:
    repo: str
    branch: str
    run_url: str
    data_commit: str = ""
    assignee: str = ALERT_ASSIGNEE

    @classmethod
    def from_env(cls, env):
        repo = env["GITHUB_REPOSITORY"]
        server = env.get("GITHUB_SERVER_URL", "https://github.com")
        return cls(
            repo=repo,
            branch=env["GITHUB_REF_NAME"],
            run_url=f"{server}/{repo}/actions/runs/{env['GITHUB_RUN_ID']}",
            data_commit=env.get("DATA_COMMIT", ""),
        )


class GitHub:
    """The few reads and writes the report needs, through the gh CLI."""

    def __init__(self, repo, branch, dry_run=False, run=subprocess.run):
        self.repo = repo
        self.branch = branch
        self.dry_run = dry_run
        self._run = run

    def _read(self, *args):
        result = self._run(["gh", *args], check=True, capture_output=True, text=True)
        return result.stdout

    def _write(self, *args):
        if self.dry_run:
            print("would run: gh " + shlex.join(args))
            return
        self._run(["gh", *args], check=True)

    def open_issue(self):
        """(number, UTC date opened) of the oldest open outage issue, or None."""
        rows = self._read(
            "api",
            "--paginate",
            f"repos/{self.repo}/issues?state=open&per_page=100",
            "--jq",
            ".[] | select(.pull_request == null)"
            f" | select(.title == {json.dumps(ISSUE_TITLE)})"
            ' | "\\(.number) \\(.created_at)"',
        ).splitlines()
        issues = sorted(
            (int(number), utc_date(created)) for number, created in map(str.split, rows)
        )
        return issues[0] if issues else None

    def last_mention_date(self, issue):
        """The UTC date of the issue's last mention comment, or None."""
        dates = self._read(
            "api",
            "--paginate",
            f"repos/{self.repo}/issues/{issue}/comments?per_page=100",
            "--jq",
            f'.[] | select(.user.login == "{BOT_LOGIN}"'
            f" and (.body | contains({json.dumps(MENTION_MARKER)})))"
            " | .created_at",
        ).split()
        return max(map(utc_date, dates)) if dates else None

    def source_date(self):
        """sourceDate of the data on the branch."""
        meta = self._read(
            "api",
            "-H",
            "Accept: application/vnd.github.raw+json",
            f"repos/{self.repo}/contents/{META_PATH}?ref={self.branch}",
        )
        return json.loads(meta)["sourceDate"]

    def create_issue(self, body, assignee):
        self._write(
            "issue",
            "create",
            "--repo",
            self.repo,
            "--title",
            ISSUE_TITLE,
            "--body",
            body,
            "--assignee",
            assignee,
        )

    def comment(self, issue, body):
        self._write("issue", "comment", str(issue), "--repo", self.repo, "--body", body)

    def close_issue(self, issue, comment):
        self._write(
            "issue", "close", str(issue), "--repo", self.repo, "--comment", comment
        )


def utc_date(timestamp):
    return (
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        .astimezone(timezone.utc)
        .date()
    )


def known_source_date(github):
    """The branch's sourceDate, or a placeholder: a report must not fail on it."""
    try:
        return github.source_date()
    except (subprocess.CalledProcessError, ValueError, KeyError) as error:
        print(f"::warning::Could not read {META_PATH}: {error}")
        return "an unknown date"


def failure_summary(ctx, source_date, ci_failed):
    if ci_failed:
        return (
            f"CI run {ctx.run_url} on {ctx.branch}, dispatched for data commit "
            f"{ctx.data_commit}, failed. That commit is on {ctx.branch}, so the "
            "site may already serve its data. The failure may come from the "
            f"new data or from code already on {ctx.branch}."
        )
    if ctx.data_commit:
        return (
            f"The run at {ctx.run_url} pushed data commit {ctx.data_commit} to "
            f"{ctx.branch} but could not start CI on it."
        )
    return (
        f"The run at {ctx.run_url} failed before publishing, so {ctx.branch} "
        f"keeps the data from {source_date}. If the sanity gate tripped on a "
        "real event, rerun the workflow with the check named in its log in "
        "the `allow` input."
    )


def issue_body(ctx, source_date, ci_failed):
    return (
        f"{failure_summary(ctx, source_date, ci_failed)}\n\n"
        "The next good run closes this issue. Until then the assignee is "
        f"mentioned once it has been open {MENTION_AFTER_DAYS_OPEN} days, and "
        f"every {REMIND_EVERY_DAYS} days after that."
    )


def mention_body(ctx, source_date, ci_failed, opened, days_open):
    return (
        f"@{ctx.assignee} no daily Forbes update has succeeded since this "
        f"issue opened on {opened.isoformat()}, {days_open} days ago. "
        f"{ctx.branch} has data from {source_date}.\n\n"
        f"Latest failure: {failure_summary(ctx, source_date, ci_failed)}\n\n"
        f"{MENTION_MARKER}"
    )


def report_failure(github, ctx, today, ci_failed=False):
    """Open the outage issue, or mention the assignee if the outage has run on."""
    source_date = known_source_date(github)
    issue = github.open_issue()
    if issue is None:
        github.create_issue(issue_body(ctx, source_date, ci_failed), ctx.assignee)
        return
    number, opened = issue
    days_open = (today - opened).days
    last_mention = github.last_mention_date(number)
    since = None if last_mention is None else (today - last_mention).days
    if should_mention(days_open, since):
        github.comment(
            number, mention_body(ctx, source_date, ci_failed, opened, days_open)
        )
    else:
        print(f"Issue #{number} is open, but no mention is due.")


def report_success(github, ctx):
    """Close the outage issue, if one is open."""
    issue = github.open_issue()
    if issue is None:
        print("No outage issue is open.")
        return
    github.close_issue(
        issue[0],
        f"The run at {ctx.run_url} succeeded, and {ctx.branch} has data from "
        f"{known_source_date(github)}. Closing.",
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("outcome", choices=["failure", "ci-failure", "success"])
    parser.add_argument(
        "--dry-run", action="store_true", help="print writes instead of making them"
    )
    args = parser.parse_args(argv)
    ctx = Context.from_env(os.environ)
    github = GitHub(ctx.repo, ctx.branch, dry_run=args.dry_run)
    if args.outcome == "success":
        report_success(github, ctx)
    else:
        today = datetime.now(timezone.utc).date()
        report_failure(github, ctx, today, ci_failed=args.outcome == "ci-failure")


if __name__ == "__main__":
    main()
