# StoryRail pipeline: order of agents and gates

Requirements are written by a **person, the analyst**, as issues in the squad backlog repo. StoryRail never writes requirements.
The product is two projects in their own repos, deployed separately: the **frontend** (library-frontend) and the **backend** (library-backend, which owns the API contract). The backend's acceptance tests live in a third repo, **library-api-tests** (Cucumber + Java). A story can touch the frontend, the backend, or both; the backend lane always includes its API tests.
Every run starts at **requirement fetch**: you give it an issue number (`/storyrail 46` for a story, `/storyrail fix 50` for a bug) and the agent reads that issue and works from it. Writing the issue happens before StoryRail, so it isn't a stage on the dashboard. Nothing reaches the QA environment until the review and the local quality scan are clean. CI/CD then re-runs the same scan on the server (SonarQube quality gate) as the enforcing check: the local scan finds problems early, and the server gate makes sure nothing slips through.

| # | Stage | Agent / step | Runs against | Gate to the next stage |
|---|---|---|---|---|
| 1 | Requirements | **Requirement fetch** (`sr-req-fetch`, an agent): fetches the issue number you gave (user story or bug), checks the ACs are testable, shares the API contract | Backlog issues | ACs testable, contract agreed (in the backend repo, copied to the frontend) |
| 2 | Build | **Frontend dev** (`sr-fe-dev`) ∥ **Backend dev** (`sr-be-dev`), each with unit tests, each in its own project repo on a story branch; only the lanes the story needs | local clones | Unit tests + coverage green |
| 3 | Isolated tests | **Isolated UI automation** (`sr-ui-tests`, after FE dev) ∥ **API automation** (`sr-api-tests`, after BE dev: Cucumber + Java scenarios in library-api-tests) | localhost: built app with mocked API / local jar | All AC-tagged tests green |
| 4 | Review + local scan | **Strict reviewer** (`sr-reviewer`, read-only) ∥ **Local quality scan** (`sr-scan`) (Sonar rules via SonarQube for IDE / sonar-scanner in connected mode, SAST, secrets, dependency audit) | local workspace | Both reports collected |
| 5 | Fix | **Review fixer** (`sr-fixer`, fresh agent) fixes the combined findings from both reports in one pass; reviewer and scan re-run; max 2 rounds | local workspace | **Quality gate:** reviewer APPROVE (0 blocker/major) **and** scan with 0 blocker/major, 0 lint warnings, 0 secrets, 0 high/critical vulnerabilities. Minors are fixed but never block. |
| 6 | CI/CD → QA | One PR per touched repo (same branch name everywhere); each repo's pipeline re-runs all checks. **You approve the merge**: backend first (it publishes the contract and deploys the API), then the API tests, then the frontend | Each repo's GitHub Actions | PR checks green + your OK; deploys green |
| 7 | QA environment | **Smoke test** per deployed project (automated go/no-go, minutes) → **API acceptance on QA** (the `@qa` Cucumber scenarios against the deployed API, automated) → **Manual QA** (`sr-manual-qa`, exploratory, against the QA URL) | QA URL | Smoke pass; `@qa` scenarios green; no open blocker/major defects |
| 8 | Sign-off | **Product owner** accepts the story for UAT / production | QA URL | Human approval |

## Terms

- **CI/CD vs deploy.** CI/CD is the whole automated pipeline (build, test, scan, package, deploy). Deploy is its last step. Writing the pipeline files is one-time setup, not a per-story stage.
- **Smoke vs manual QA.** Smoke: a few automated checks right after a deploy (site up, app loads, health endpoint). It answers "is this build alive?" Manual QA: deeper, exploratory testing of the acceptance criteria and UX on the QA environment. It only starts once smoke passes.
- **Isolated UI automation.** Playwright against a local build with a mocked API, so failures point at the frontend alone.
- **Lanes = repos.** The frontend lane works in library-frontend; the backend lane in library-backend **and** library-api-tests. Each repo gets its own branch (same name in every repo), PR and pipeline; all of them point at the same backlog issue.
- **One API suite, two runs.** The Cucumber suite runs **isolated** (against the jar, on every backend and API-test PR) and on **QA** (the `@qa` scenarios, after each backend deploy). A story branch in library-api-tests is tested against the backend branch with the same name.
- **API acceptance vs manual QA.** API acceptance is automated and proves the deployed API meets its ACs; manual QA then judges the whole product like a user would.
- **Contract.** library-backend owns `docs/api/openapi.yaml`. library-frontend and library-api-tests keep pinned copies in `contract/openapi.yaml`, and their CI fails while a copy differs from the backend's. That's why the backend merges first.
- **Human gates.** You pick the issue number, answer open questions, you approve the merge to QA, you triage QA defects, and you sign off. Everything between is the agents' job.

## Defect loop (`/storyrail fix <bug issues>`)

For bugs found in QA. Shorter than the story rail: only the affected project runs.

1. **Requirement fetch** reads the bug issue and turns its expected behaviour into ACs (`BUG-<n>`).
2. Dev of the affected lane fixes it.
3. That lane's test agent adds a **regression test that fails on the old code** (for the backend: a Cucumber scenario tagged `@BUG-<n>` and `@qa`).
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
| Local clones of the projects | `projects/frontend`, `projects/backend` (`node scripts/storyrail-workspace.mjs sync`) |
| Output of one run | `runs/issue-<N>/` |
| Exams: practice stories, hidden tests, results | `evals/` (`node scripts/storyrail-eval.mjs list`) |
| Live dashboard | `node scripts/storyrail-dashboard.mjs` → http://localhost:4800 |
| Setup on a new machine | [SETUP.md](SETUP.md) |

