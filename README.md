<p align="center"><img src="docs/brand/storyrail-wordmark.svg" alt="StoryRail: from user story to signed-off release" width="420"></p>

# StoryRail

**StoryRail** puts a user story on rails: a squad of specialised AI agents takes it from the analyst's backlog issue
to a signed-off release, with a human gate at both ends and a quality gate at every stage in between.
A story can touch **any number of existing applications** that call each other, each in its own repo: the story names
them in an **Applications** section, StoryRail finds them on GitHub, builds them **all at the same time** against each
other's API contracts, and merges them in dependency order. The demo product is a small **Library Catalog** (browse,
search, filter, add, delete and toggle the availability of books): a backend and a frontend that calls it.

## The five repos

| Repo | What | Deploys to |
|---|---|---|
| [squad-backlog](https://github.com/storyrail-squad/squad-backlog) | The squad's user stories and bugs, nothing else | – |
| **storyrail** (this repo) | The hub: agents, `/storyrail` command, live dashboard, every run's reports | – |
| [library-frontend](https://github.com/storyrail-squad/library-frontend) | React app + UI automation, own CI/CD | [GitHub Pages (QA)](https://storyrail-squad.github.io/library-frontend/) |
| [library-backend](https://github.com/storyrail-squad/library-backend) | Spring Boot API, **owns the API contract**, own CI/CD | Render (QA) |
| [library-api-tests](https://github.com/storyrail-squad/library-api-tests) | Backend acceptance tests in Cucumber + Java: run isolated on every backend PR, and `@qa` against the QA API after each deploy | – |

StoryRail runs from this repo. Applications aren't configured here: each story's **Applications** section names them
(`- library-backend (books API): …`, `- library-frontend (catalog app): …, calls library-backend`), and
`scripts/storyrail-apps.mjs` finds each as a repo in the GitHub org, tells frontend from backend, clones it into
`projects/` (not committed here) and works out who calls whom. Every repo the story touches gets a branch and a PR,
all pointing at the same backlog issue. Providers merge first, so a caller always builds against a published contract.
The only per-app settings in [`storyrail.config.json`](storyrail.config.json) are the exceptions, such as library-backend
keeping its API tests in library-api-tests.

## The rail

| # | Stage | Who |
|---|---|---|
| 1 | Requirements | You run `/storyrail <issue>` → **Requirement fetch** agent reads that backlog issue (user story or bug) |
| 2 | Build | One developer per application, **all at the same time**, each with unit tests, against the contracts of the apps it calls (mocked or stubbed) |
| 3 | Isolated tests | Per app: **UI automation** for a frontend (API mocked) ∥ **API automation**, Cucumber + Java, for a backend running locally (the apps it calls stubbed) |
| 4 | Review + local scan | **Strict reviewer** (read-only) ∥ **Local quality scan** (Sonar rules, SAST, secrets, dependencies) |
| 5 | Fix | **Review fixer** fixes both reports in one pass; the changed apps' tests re-run, then re-check, max 2 rounds |
| 6 | CI/CD → QA | One PR per repo; merged in dependency order (library-backend, its API tests, then library-frontend); each pipeline re-runs every check and deploys its app to QA |
| 7 | QA environment | **Smoke test** per app → **API acceptance** (`@qa` Cucumber scenarios on the QA API) → **Manual QA** on the deployed QA URL |
| 8 | Sign-off | **You** accept the story for UAT / production |

Defects found in QA go through a shorter **defect loop** (bug issue in the backlog → fix in the affected project only →
regression test → diff review + scan → CI/CD → smoke → targeted re-test). Full definitions: [docs/storyrail/PIPELINE.md](docs/storyrail/PIPELINE.md).

**Exams (evaluation-driven development).** When Claude Code is updated or you change a brief, a rule or a skill,
`/storyrail eval` makes the whole squad build fixed practice stories from frozen code, three times each, and hidden
tests the agents never see grade every run. Nothing is pushed or merged. The **Evals** tab compares the score with the
previous exam and says whether to keep the change: [evals/README.md](evals/README.md).

## How to run it

One-time setup on your Mac: [docs/storyrail/SETUP.md](docs/storyrail/SETUP.md). Run **one story or bug at a time**:
the dashboard and your working folder follow a single run.

**Before each run**

```bash
cd storyrail
git switch main && git pull
claude
```

Open **http://localhost:4800** on a second screen. It comes alive as soon as the run starts.

### A. A new user story

1. **The analyst creates the issue in [squad-backlog](https://github.com/storyrail-squad/squad-backlog)** with the **User story** template: the story ("As a … I want … so that …"),
   numbered acceptance criteria (`AC1`, `AC2`, …) and the **Applications** section: one line per app, saying what
   changes and which other app it calls. Example: [#2](https://github.com/storyrail-squad/squad-backlog/issues/2). Note the number.
2. **Start the run** in Claude Code: `/storyrail 2` (stories that belong together: `/storyrail 2 3`). StoryRail finds and
   clones the apps itself.
3. **Answer when it stops.** It only pauses here:

   | When | It asks | You answer |
   |---|---|---|
   | Requirement fetch | Questions about unclear acceptance criteria, or which apps when the issue doesn't say (only if any) | Your answers; it posts them on the issue |
   | Before merge | "PRs are green: library-backend #X → library-api-tests #Z → library-frontend #Y. Merge them in this order and deploy to QA?" | **yes** |
   | After manual QA | Which defects to fix now (only if QA found any) | e.g. "fix all majors, rest to backlog" |
   | Sign-off | "Approve?" | **approve** |

4. **Result:** each repo's PR is merged and deployed in dependency order (the backend and its API tests first, then the
   [frontend QA site](https://storyrail-squad.github.io/library-frontend/)), the backlog issue gets a summary comment with
   every PR and is closed, and the reports are saved here in `runs/issue-<N>/`.

Defects that manual QA finds *during* a story run are handled inside that run: StoryRail creates the bug issues and
fixes them before sign-off. You don't need part B for those.

### B. A new bug (found outside a story run)

1. **The analyst creates the issue in squad-backlog** with the **Bug** template: steps to reproduce, expected, actual (with a screenshot
   if possible), severity and an **Applications** section naming the app it is in. Note the number, e.g. **#5**.
2. **Start the defect loop:** `/storyrail fix 5` (several bugs: `/storyrail fix 5 6`).
3. **Answer when it stops:** questions about the bug (only if steps or expected are missing), and
   "PR #X is green. Merge and deploy to QA?" → **yes**. Only the affected app gets a PR (a backend also its API-tests repo).
4. **Result:** the fix ships with a regression test, the PR (in the app's repo) closes the backlog issue, and manual QA re-tests it on the QA site and
   comments **"Verified on QA"**. If it isn't fixed, the issue is reopened and you are asked what to do.

### Handy anytime

| Want to… | Type |
|---|---|
| See where a run is | `/storyrail status` |
| Resume after you fixed or answered something | `continue` |
| Keep your Mac awake during a run | `caffeinate -i` in another terminal |

## What's in this repo

| Path | What |
|---|---|
| `storyrail.config.json` | Backlog repo, project repos, local paths, workflow names, QA URL |
| `.claude/agents/`, `.claude/skills/storyrail/` | The agents and the `/storyrail` orchestrator; conventions in [CLAUDE.md](CLAUDE.md) |
| `scripts/storyrail-apps.mjs` | Finds the story's applications on GitHub, clones them into `projects/`, works out the dependency order (`runs/issue-<N>/apps.json`) |
| `scripts/storyrail-status.mjs`, `scripts/storyrail-dashboard.mjs`, `storyrail-dashboard/` | Live dashboard (http://localhost:4800): the orchestrator handing out work (Orchestration), the squad as named members with live status and a chat per member, plus the rail diagram |
| `docs/demo/index.html` | Stand-alone demo replay with sample data: open the file, no server or network needed (`node scripts/storyrail-build-demo.mjs` rebuilds it) |
| `runs/issue-<N>/` | Every run's spec, review and scan reports, fixer responses, QA logs and evidence |
| `docs/storyrail/` | [Pipeline and gates](docs/storyrail/PIPELINE.md), [setup](docs/storyrail/SETUP.md) |
| `evals/`, `scripts/storyrail-eval.mjs` | Exams: practice stories, hidden tests (the answer key), targets and every exam's results ([evals/README.md](evals/README.md)) |
| `docs/brand/` | Logo: the S-Track mark, favicon and wordmark (light and dark); `storyrail-rails.svg`/`.png` is the 1280×640 title card for slides, the GitHub social preview and posts |
| `tests/manual/`, `docs/history/run-1/`, `docs/QUALITY-GATE.md` | Records of the first run (from before the repo split) |

How to build, test and deploy each project: see the README of
[library-frontend](https://github.com/storyrail-squad/library-frontend) and
[library-backend](https://github.com/storyrail-squad/library-backend) and
[library-api-tests](https://github.com/storyrail-squad/library-api-tests).
