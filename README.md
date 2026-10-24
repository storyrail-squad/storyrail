<p align="center"><img src="docs/brand/storyrail-wordmark.svg" alt="StoryRail: from user story to signed-off release" width="420"></p>

# StoryRail

**StoryRail** puts a user story on rails: a squad of specialised AI agents takes it from the analyst's backlog issue
to a signed-off release, with a human gate at both ends and a quality gate at every stage in between.
The product it builds for the demo is a small **Library Catalog** (browse, search, filter, add, delete and toggle the
availability of books), made of a frontend and a backend that live in **separate repos and deploy separately**.

## The five repos

| Repo | What | Deploys to |
|---|---|---|
| [squad-backlog](https://github.com/storyrail-squad/squad-backlog) | The squad's user stories and bugs, nothing else | – |
| **storyrail** (this repo) | The hub: agents, `/storyrail` command, live dashboard, every run's reports | – |
| [library-frontend](https://github.com/storyrail-squad/library-frontend) | React app + UI automation, own CI/CD | [GitHub Pages (QA)](https://storyrail-squad.github.io/library-frontend/) |
| [library-backend](https://github.com/storyrail-squad/library-backend) | Spring Boot API, **owns the API contract**, own CI/CD | Render (QA) |
| [library-api-tests](https://github.com/storyrail-squad/library-api-tests) | Backend acceptance tests in Cucumber + Java: run isolated on every backend PR, and `@qa` against the QA API after each deploy | – |

StoryRail runs from this repo. `node scripts/storyrail-workspace.mjs sync` clones the two projects into `projects/`
(not committed here), and the agents work across them: a story that touches both gets a branch and a PR in each repo,
both pointing at the same backlog issue. The backend PR merges first, so the frontend always builds against a published
contract. All repo names live in [`storyrail.config.json`](storyrail.config.json).

## The rail

| # | Stage | Who |
|---|---|---|
| 1 | Requirements | You run `/storyrail <issue>` → **Requirement fetch** agent reads that backlog issue (user story or bug) |
| 2 | Build | **Frontend dev** (library-frontend) ∥ **Backend dev** (library-backend), each with unit tests |
| 3 | Isolated tests | **Isolated UI automation** (after FE) ∥ **API automation**, Cucumber + Java in library-api-tests (after BE) |
| 4 | Review + local scan | **Strict reviewer** (read-only) ∥ **Local quality scan** (Sonar rules, SAST, secrets, dependencies) |
| 5 | Fix | **Review fixer** fixes both reports in one pass; re-check, max 2 rounds |
| 6 | CI/CD → QA | One PR per touched repo; each pipeline re-runs every check and deploys its own part to QA (backend, then API tests, then frontend) |
| 7 | QA environment | **Smoke test** per project → **API acceptance** (`@qa` Cucumber scenarios on the QA API) → **Manual QA** on the deployed QA URL |
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
node scripts/storyrail-workspace.mjs sync    # clones or updates library-frontend, library-backend and library-api-tests in projects/
claude
```

Open **http://localhost:4800** on a second screen. It comes alive as soon as the run starts.

### A. A new user story

1. **The analyst creates the issue in [squad-backlog](https://github.com/storyrail-squad/squad-backlog)** with the **User story** template: the story ("As a … I want … so that …"),
   numbered acceptance criteria (`AC1`, `AC2`, …) and the **Frontend** / **Backend** ticks. Note the number, e.g. **#51**.
2. **Start the run** in Claude Code: `/storyrail 51` (stories that belong together: `/storyrail 51 52`).
3. **Answer when it stops.** It only pauses here:

   | When | It asks | You answer |
   |---|---|---|
   | Requirement fetch | Questions about unclear acceptance criteria (only if any) | Your answers; it posts them on the issue |
   | Before merge | "PRs are green: backend #X, API tests #Z, frontend #Y. Merge and deploy to QA?" | **yes** |
   | After manual QA | Which defects to fix now (only if QA found any) | e.g. "fix all majors, rest to backlog" |
   | Sign-off | "Approve?" | **approve** |

4. **Result:** each repo's PR is merged and deployed (backend and its API tests first, then the [frontend QA site](https://storyrail-squad.github.io/library-frontend/)),
   the backlog issue gets a summary comment with every PR and is closed, and the reports are saved here in `runs/issue-51/`.

Defects that manual QA finds *during* a story run are handled inside that run: StoryRail creates the bug issues and
fixes them before sign-off. You don't need part B for those.

### B. A new bug (found outside a story run)

1. **The analyst creates the issue in squad-backlog** with the **Bug** template: steps to reproduce, expected, actual (with a screenshot
   if possible), lane and severity. Note the number, e.g. **#52**.
2. **Start the defect loop:** `/storyrail fix 52` (several bugs: `/storyrail fix 52 53`).
3. **Answer when it stops:** questions about the bug (only if steps or expected are missing), and
   "PR #X is green. Merge and deploy to QA?" → **yes**. Only the affected project gets a PR.
4. **Result:** the fix ships with a regression test, the PR (in the project repo) closes the backlog issue, and manual QA re-tests it on the QA site and
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
| `scripts/storyrail-workspace.mjs` | Clones/updates the project repos into `projects/` |
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
