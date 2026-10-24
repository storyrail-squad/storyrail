# StoryRail pipeline: order of agents and gates

**Before StoryRail (people).** The product owner gets the requirement from the business. The functional analyst refines
it with the stakeholders, writes the **Screen document** (frontend) and the **API document** (backend), attaches them to
the user story in GitLab and explains it at the 3 amigos meeting.

**StoryRail (agents)** starts from that GitLab issue (`/storyrail 51` for a story, `/storyrail fix 60` for a bug) and
stops when the merged code's **GitLab CI pipeline on the default branch is green**.

**After StoryRail (people).** The team deploys to QA with CDD. The testers run their prepared test cases, their E2E UI and
API automation against QA and their manual tests, and log defects as GitLab bugs (which come back through the defect
loop). The functional analyst and the product owner review the result at the end of the sprint and sign off.

| # | Stage | Agent / step | Runs against | Gate to the next stage |
|---|---|---|---|---|
| 1 | Requirement analysis | **Sindhu** (`sr-req-fetch`): reads the GitLab story and the attached Screen and API documents, finds the **applications** the story names (`storyrail-apps.mjs discover`: GitLab lookup, clone, type, who calls whom), makes every AC testable per app, updates each provider's contract from the API document, providers first | GitLab issue + documents | No open questions: anything unclear is asked in the Bob chat and the answers are posted on the issue |
| 2 | Build | One developer per application, **all apps at the same time**: `sr-fe-dev` for each frontend, `sr-be-dev` for each backend, each with unit tests on a story branch in its own repo. Each builds against its providers' contracts with the providers stubbed, so nobody waits for anyone | local clones | Unit tests + coverage green, lint clean |
| 3 | Isolated tests | Per app, all at the same time: **UI automation** (`sr-ui-tests`) for a frontend with its API mocked, **API automation** (`sr-api-tests`) for a backend running locally on its own port, its providers stubbed from their contracts | localhost | All AC-tagged tests green |
| 4 | Review + scans | **Tech lead review** (`sr-reviewer`, read-only, every app's diff) ∥ **Quality scans** (`sr-scan`, every app): **Sonar, Fortify, NexusIQ** (each locally or through the branch pipeline, as configured) plus quick checks (lint, secrets, contract copies) | local clones (or the pushed branch) | Both reports collected |
| 5 | Fix | **The developers** fix the findings of their own app, one developer per app with findings, side by side, minors included, with regression tests | local clones | Every finding fixed, disputed with evidence, or raised for a decision |
| 6 | Re-run tests + re-check | The test agents of the apps that changed re-run their whole suites on the fixed code ( a fix that broke an AC goes back to the developer). Then back to 4: the tech lead checks the fixes, the scans run on the fixed code. Max 2 fix rounds | localhost | **Quality gate:** review APPROVE (0 blocker/major) **and** Sonar quality gate passed **and** Fortify without critical/high **and** NexusIQ without Critical/Severe violations **and** quick checks clean |
| 7 | Release: merge + CI | One merge request per app (same branch name everywhere); its pipeline runs. **You approve the merge** in the Bob chat. Merge order = dependency order, providers first (`storyrail-apps.mjs order <N>`); after each merge StoryRail follows the CI pipeline on the default branch | GitLab CI | Every default-branch pipeline green → the story is commented and labelled "Ready for QA" |

## Terms

- **∥ (side by side).** The agents of a stage don't depend on each other, so in IBM Bob they run **at the same time as subagents**, one per app (`build.mode: "sequential"` runs them one after the other). A subagent doesn't get its mode's file limits, so a lane check (`scripts/storyrail-lanes.mjs`) runs before and after: any file changed outside the agents' lanes fails the stage.
- **Applications.** The story's `## Applications` section names the existing apps it touches, e.g. `- INSU-ta01 (task API)`, `- INSU-fa01 (facade, calls INSU-ta01)`, `- INSU-sp01 (frontend, calls INSU-fa01)`. Sindhu's discovery finds each one in the `gitlab.group`, tells frontend from backend by its files, clones it to `projects/<type>/<app>` and writes `runs/issue-<N>/apps.json`. Nothing to configure per app; `apps.map` is only for names that don't match a GitLab project.
- **Lanes = apps.** Every app is its own lane (`dev@<app>`, `tests@<app>`, `fix@<app>`), with its own branch (same name in every app) and merge request; all of them point at the same GitLab issue. Its tests live in its own repo.
- **Local vs CI scans.** `local`: the scanner runs on your machine before anything is pushed (sonar-scanner or the Maven plugin against your SonarQube, Fortify SCA or the ScanCentral client, the NexusIQ CLI); fastest feedback. `ci`: the run branch is pushed (not merged) and the branch pipeline's scan job runs; StoryRail reads the result. Set per scanner in `storyrail.config.json` → `scans`.
- **Why CI is the end.** CDD deployments can't be followed from StoryRail, so a run ends when the merged code builds and passes its pipeline. Everything after that is visible on the dashboard as "outside StoryRail".
- **Contracts.** Every backend owns its OpenAPI contract; an app that calls it keeps a copy (found by matching the contract title). Sindhu changes a provider's contract and its copies together, from the API document. That's why providers merge first.
- **Human gates.** You pick the issue, answer the clarifying questions and approve the merge. Everything between is the agents' job.

## Defect loop (`/storyrail fix <bug issues>`)

For bugs the testers log in GitLab after testing in QA. Same rail, only the affected app(s).

1. **Requirement analysis** reads the bug and turns its expected behaviour into ACs (`BUG-<n>`).
2. The developer of the affected app fixes it.
3. That app's test agent adds a **regression test that fails on the old code** (tag `@BUG-<n>`).
4. Review + scans on that app's diff, fixes by the developer, re-check (max 2 rounds).
5. Merge request (`Fixes #<bug>`), your OK, merge, CI on the default branch green.
6. The bug is commented "ready for re-test in QA" and labelled; the testers re-test it after the CDD deployment.

## Exams (`/storyrail eval <baseline|tool|change>`)

Not part of a story run: a check on the squad itself. The squad builds the practice stories in `evals/` (steps 1–6 of the
rail, from frozen commits of their applications, several runs each, nothing pushed) and hidden tests grade every run. The
result is compared with the previous exam (the first one with the targets): **keep** a change, **roll it back**, or after
a Bob update, **raise it with IBM** with the exam as evidence. Details: [evals/README.md](../../evals/README.md).

## Where things are

| What | Where |
|---|---|
| `/storyrail` command | `.bob/commands/storyrail.md` |
| Orchestrator brief | `.bob/rules-sr-orchestrator/01-orchestrator.md` |
| Agents (IBM Bob custom modes, with edit limits) | `.bob/custom_modes.yaml` |
| Each agent's brief | `.bob/rules-sr-*/01-brief.md` |
| Project conventions every mode follows | `.bob/rules/01-project-guide.md` |
| GitLab, app types, scans, squad | `storyrail.config.json` |
| The run's applications | `runs/issue-<N>/apps.json` (`node scripts/storyrail-apps.mjs show <N>`) |
| GitLab from the agents | `node scripts/storyrail-gitlab.mjs` (token) or the GitLab MCP server |
| Local clones of the apps | `projects/<frontend|backend>/<app>` (made by discovery; `storyrail-apps.mjs sync <N>` updates them) |
| Output of one run | `runs/issue-<N>/` |
| Exams: practice stories, hidden tests, results | `evals/` (`node scripts/storyrail-eval.mjs list`) |
| Live dashboard | `node scripts/storyrail-dashboard.mjs` → http://localhost:4800 |
| Setup on a new machine | [SETUP.md](SETUP.md) |
