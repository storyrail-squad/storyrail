# StoryRail pipeline: order of agents and gates

Requirements are written by a **person, the analyst**, as issues in the squad backlog repo. StoryRail never writes requirements.
A story can touch **any number of existing applications** that call each other, each in its own repo and deployed separately. The issue's **Applications** section names them; StoryRail finds them on GitHub (`scripts/storyrail-apps.mjs`). The demo product has a **backend** (library-backend, which owns its API contract, with its acceptance tests in **library-api-tests**, Cucumber + Java) and a **frontend** that calls it (library-frontend).
Every run starts at **requirement fetch**: you give it an issue number (`/storyrail 46` for a story, `/storyrail fix 50` for a bug) and the agent reads that issue and works from it. Writing the issue happens before StoryRail, so it isn't a stage on the dashboard. Nothing reaches the QA environment until the review and the local quality scan are clean. CI/CD then re-runs the same scan on the server (SonarQube quality gate) as the enforcing check: the local scan finds problems early, and the server gate makes sure nothing slips through.

| # | Stage | Agent / step | Runs against | Gate to the next stage |
|---|---|---|---|---|
| 1 | Requirements | **Requirement fetch** (`sr-req-fetch`, an agent): fetches the issue number you gave (user story or bug), finds its applications (GitHub lookup, clone, type, who calls whom), checks the ACs per app are testable, updates each backend's contract, providers first | Backlog issues | ACs testable, apps known, contracts agreed (in each backend, copied to its callers and API tests) |
| 2 | Build | One developer per application, **all at the same time**: `sr-fe-dev` per frontend, `sr-be-dev` per backend, each with unit tests on a story branch in its own repo, against the contracts of the apps it calls (mocked or stubbed) | local clones | Unit tests + coverage green |
| 3 | Isolated tests | Per app, all at the same time: **UI automation** (`sr-ui-tests`) for a frontend, **API automation** (`sr-api-tests`, Cucumber + Java, in the backend's API-tests repo when it has one) for a backend running locally, each on its own ports, the apps it calls stubbed | localhost: built app with mocked API / local jar | All AC-tagged tests green |
| 4 | Review + local scan | **Strict reviewer** (`sr-reviewer`, read-only) ∥ **Local quality scan** (`sr-scan`) (Sonar rules via SonarQube for IDE / sonar-scanner in connected mode, SAST, secrets, dependency audit) | local workspace | Both reports collected |
| 5 | Fix | **Review fixer** (`sr-fixer`, fresh agent) fixes the combined findings from both reports in one pass; the changed apps' test agents re-run their suites, then reviewer and scan re-run; max 2 rounds | local workspace | **Quality gate:** reviewer APPROVE (0 blocker/major) **and** scan with 0 blocker/major, 0 lint warnings, 0 secrets, 0 high/critical vulnerabilities. Minors are fixed but never block. |
| 6 | CI/CD → QA | One PR per repo of the story (same branch name everywhere); each repo's pipeline re-runs all checks. **You approve the merge**, then StoryRail merges in **dependency order**: each backend first (it publishes its contract and deploys its API), then its API tests, then the apps that call it | Each repo's GitHub Actions | PR checks green + your OK; deploys green |
| 7 | QA environment | **Smoke test** per deployed app (automated go/no-go, minutes) → **API acceptance on QA** (the `@qa` Cucumber scenarios against the deployed API, automated) → **Manual QA** (`sr-manual-qa`, exploratory, against the QA URL) | QA URL | Smoke pass; `@qa` scenarios green; no open blocker/major defects |
| 8 | Sign-off | **Product owner** accepts the story for UAT / production | QA URL | Human approval |

## Terms

- **CI/CD vs deploy.** CI/CD is the whole automated pipeline (build, test, scan, package, deploy). Deploy is its last step. Writing the pipeline files is one-time setup, not a per-story stage.
- **Smoke vs manual QA.** Smoke: a few automated checks right after a deploy (site up, app loads, health endpoint). It answers "is this build alive?" Manual QA: deeper, exploratory testing of the acceptance criteria and UX on the QA environment. It only starts once smoke passes.
- **Isolated UI automation.** Playwright against a local build with a mocked API, so failures point at the frontend alone.
- **Applications.** The issue's `## Applications` section names the apps, e.g. `- library-backend (books API): …` and `- library-frontend (catalog app): …, calls library-backend`. Discovery finds each as a repo in `github.org`, tells frontend from backend by its files, clones it to `projects/<type>/<app>` and writes `runs/issue-<N>/apps.json`. `apps.map` in the config only holds the exceptions (library-backend's API tests live in library-api-tests).
- **Lanes = apps.** Every app is its own lane on the dashboard (`dev@<app>`, `tests@<app>`), with its own branch (same name in every repo), PR and pipeline; all of them point at the same backlog issue.
- **One API suite, two runs.** The Cucumber suite runs **isolated** (against the jar, on every backend and API-test PR) and on **QA** (the `@qa` scenarios, after each backend deploy). A story branch in library-api-tests is tested against the backend branch with the same name.
- **API acceptance vs manual QA.** API acceptance is automated and proves the deployed API meets its ACs; manual QA then judges the whole product like a user would.
- **Contracts.** Every backend owns its contract (library-backend: `docs/api/openapi.yaml`). The apps that call it and its API-tests repo keep pinned copies (found by matching the contract title), and their CI fails while a copy differs from the backend's. That's why providers merge first.
- **Human gates.** You pick the issue number, answer open questions, you approve the merge to QA, you triage QA defects, and you sign off. Everything between is the agents' job.

## Defect loop (`/storyrail fix <bug issues>`)

For bugs found in QA. Shorter than the story rail: only the affected project runs.

1. **Requirement fetch** reads the bug issue and turns its expected behaviour into ACs (`BUG-<n>`).
2. The developer of the affected app fixes it.
3. That app's test agent adds a **regression test that fails on the old code** (for the backend: a Cucumber scenario tagged `@BUG-<n>` and `@qa`).
4. Review + local scan on the **diff only**; fixer if needed (max 2 rounds).
5. PR in the affected project's repo (`Fixes <backlog repo>#bug`, which closes the backlog issue) → checks → your OK → deploy to QA → smoke → API acceptance on QA (backend bugs).
6. Manual QA re-tests the defect and the area around it.

Severity decides what blocks sign-off: blocker/major are fixed first; minor/low can go to the backlog. A defect that shows
the requirement itself was wrong is a requirement change and goes back through the full rail.

## Exams (`/storyrail eval <baseline|tool|change>`)

Not part of a story run: a check on the squad itself. The squad builds the practice stories in `evals/` (stages 1–5 of the
rail, from frozen commits, several runs each, nothing pushed) and hidden tests grade every run. The result is compared
with the previous exam (the first one with the targets): **keep** a change, **roll it back**, or after a Claude Code
update, **pin** the previous version. Details: [evals/README.md](../../evals/README.md).

## Where things are

| What | Where |
|---|---|
| Orchestrator (`/storyrail`) | `.claude/skills/storyrail/SKILL.md` |
| Agents | `.claude/agents/sr-*.md` |
| Project conventions every agent follows | `CLAUDE.md` |
| Backlog repo, project repos, QA URL | `storyrail.config.json` |
| The run's applications | `runs/issue-<N>/apps.json` (`node scripts/storyrail-apps.mjs show <N>`) |
| Local clones of the apps | `projects/<frontend|backend>/<app>`, API-tests repos in `projects/api-tests/<repo>` (cloned by discovery) |
| Output of one run | `runs/issue-<N>/` |
| Exams: practice stories, hidden tests, results | `evals/` (`node scripts/storyrail-eval.mjs list`) |
| Live dashboard | `node scripts/storyrail-dashboard.mjs` → http://localhost:4800 |
| Setup on a new machine | [SETUP.md](SETUP.md) |

