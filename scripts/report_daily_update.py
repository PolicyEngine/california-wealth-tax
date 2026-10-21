"""Report the daily Forbes update's outcome on a GitHub issue.

The repository had no watchers in October 2026, so an issue the workflow opens
notified no one unless it named someone. From September 20 to October 20 the
daily job failed every day; it opened one unassigned issue on the first day
and said nothing after that. This script keeps one issue per outage and points
it at a person:

- the first failure opens the issue, assigned to ALERT_ASSIGNEE;
- once ESCALATE_AFTER_DAYS pass without a successful run, a comment mentions
  the assignee, and another follows every REMIND_EVERY_DAYS while the outage
  lasts;
- the next successful run closes the issue, so an open issue always means an
  outage that is still going on.

    python3 scripts/report_daily_update.py failure
    python3 scripts/report_daily_update.py success

update-forbes.yml runs it on main. It reads GITHUB_REPOSITORY,
GITHUB_REF_NAME, GITHUB_SERVER_URL, GITHUB_RUN_ID and ALERT_ASSIGNEE, plus
DATA_COMMIT and CI_RUN_ID when the run had already pushed a data commit; gh
reads GH_TOKEN. With --dry-run it still reads from GitHub but prints the
writes instead of making them.
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
WORKFLOW_FILE = "update-forbes.yml"
META_PATH = "data/billionaires_live_meta.json"
BOT_LOGIN = "github-actions[bot]"
# The first mention comes on the day the last successful run's data would fail
# check_snapshot_freshness.py, then weekly.
ESCALATE_AFTER_DAYS = MAX_SNAPSHOT_AGE_DAYS + 1
REMIND_EVERY_DAYS = 7
ESCALATION_MARKER = "<!-- daily-update-escalation -->"


def should_escalate(days_down, days_since_escalation):
    """Whether a failing run should mention the assignee.

    days_down counts days since the last successful run, or is None when none
    is on record. days_since_escalation counts days since this issue's last
    mention, or is None when it has none.
    """
    if days_down is not None and days_down < ESCALATE_AFTER_DAYS:
        return False
    return days_since_escalation is None or days_since_escalation >= REMIND_EVERY_DAYS


@dataclass
class Context:
    repo: str
    branch: str
    run_url: str
    assignee: str
    data_commit: str = ""
    ci_run_url: str = ""

    @classmethod
    def from_env(cls, env):
        repo = env["GITHUB_REPOSITORY"]
        server = env.get("GITHUB_SERVER_URL", "https://github.com")
        ci_run_id = env.get("CI_RUN_ID", "")
        return cls(
            repo=repo,
            branch=env["GITHUB_REF_NAME"],
            run_url=f"{server}/{repo}/actions/runs/{env['GITHUB_RUN_ID']}",
            assignee=env["ALERT_ASSIGNEE"],
            data_commit=env.get("DATA_COMMIT", ""),
            ci_run_url=f"{server}/{repo}/actions/runs/{ci_run_id}" if ci_run_id else "",
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
        """The oldest open issue with ISSUE_TITLE, or None."""
        numbers = self._read(
            "api",
            "--paginate",
            f"repos/{self.repo}/issues?state=open&per_page=100",
            "--jq",
            ".[] | select(.pull_request == null)"
            f" | select(.title == {json.dumps(ISSUE_TITLE)}) | .number",
        ).split()
        return min(map(int, numbers)) if numbers else None

    def last_success_date(self):
        """The UTC date of the last successful daily run on the branch, or None."""
        created = self._read(
            "api",
            f"repos/{self.repo}/actions/workflows/{WORKFLOW_FILE}/runs"
            f"?branch={self.branch}&status=success&per_page=1",
            "--jq",
            ".workflow_runs[0].created_at // empty",
        ).strip()
        return utc_date(created) if created else None

    def last_escalation_date(self, issue):
        """The UTC date of the issue's last mention comment, or None."""
        dates = self._read(
            "api",
            "--paginate",
            f"repos/{self.repo}/issues/{issue}/comments?per_page=100",
            "--jq",
            f'.[] | select(.user.login == "{BOT_LOGIN}"'
            f" and (.body | contains({json.dumps(ESCALATION_MARKER)})))"
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


def failure_summary(ctx, source_date):
    if ctx.data_commit:
        ci = f"CI on it ({ctx.ci_run_url})" if ctx.ci_run_url else "CI on it"
        return (
            f"The run at {ctx.run_url} pushed data commit {ctx.data_commit} to "
            f"{ctx.branch}, but {ci} did not pass, so the site may already "
            "serve that data. The failure may come from the new data or from "
            f"code already on {ctx.branch}."
        )
    return (
        f"The run at {ctx.run_url} failed before publishing, so {ctx.branch} "
        f"keeps the data from {source_date}. If the sanity gate tripped on a "
        "real event, rerun the workflow with the check named in its log in "
        "the `allow` input."
    )


def issue_body(ctx, source_date):
    return (
        f"{failure_summary(ctx, source_date)}\n\n"
        "The next successful run closes this issue. Until then the assignee is "
        f"mentioned once {ESCALATE_AFTER_DAYS} days pass without a successful "
        f"run, and every {REMIND_EVERY_DAYS} days after that."
    )


def escalation_body(ctx, source_date, days_down, last_success):
    if last_success is None:
        span = "has no successful run on record"
    else:
        span = (
            f"has not succeeded for {days_down} days, since {last_success.isoformat()}"
        )
    return (
        f"@{ctx.assignee} the daily Forbes update {span}. "
        f"{ctx.branch} has data from {source_date}.\n\n"
        f"Latest failure: {failure_summary(ctx, source_date)}\n\n"
        f"{ESCALATION_MARKER}"
    )


def known_source_date(github):
    """The branch's sourceDate, or a placeholder: a report must not fail on it."""
    try:
        return github.source_date()
    except (subprocess.CalledProcessError, ValueError, KeyError) as error:
        print(f"::warning::Could not read {META_PATH}: {error}")
        return "an unknown date"


def report_failure(github, ctx, today):
    """Open the outage issue, or mention the assignee if the outage has run on."""
    source_date = known_source_date(github)
    issue = github.open_issue()
    if issue is None:
        github.create_issue(issue_body(ctx, source_date), ctx.assignee)
        return
    last_success = github.last_success_date()
    days_down = None if last_success is None else (today - last_success).days
    last_escalation = github.last_escalation_date(issue)
    since = None if last_escalation is None else (today - last_escalation).days
    if should_escalate(days_down, since):
        github.comment(
            issue, escalation_body(ctx, source_date, days_down, last_success)
        )
    else:
        print(
            f"Issue #{issue} is open and its assignee was told within "
            f"{REMIND_EVERY_DAYS} days, or the outage is under "
            f"{ESCALATE_AFTER_DAYS} days old; no new mention."
        )


def report_success(github, ctx):
    """Close the outage issue, if one is open."""
    issue = github.open_issue()
    if issue is None:
        return
    github.close_issue(
        issue,
        f"The run at {ctx.run_url} succeeded, and {ctx.branch} has data from "
        f"{known_source_date(github)}. Closing.",
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("outcome", choices=["failure", "success"])
    parser.add_argument(
        "--dry-run", action="store_true", help="print writes instead of making them"
    )
    args = parser.parse_args(argv)
    ctx = Context.from_env(os.environ)
    github = GitHub(ctx.repo, ctx.branch, dry_run=args.dry_run)
    if args.outcome == "failure":
        report_failure(github, ctx, datetime.now(timezone.utc).date())
    else:
        report_success(github, ctx)


if __name__ == "__main__":
    main()
