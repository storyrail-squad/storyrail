# StoryRail project guide

StoryRail takes a user story or a bug from GitLab through a squad of AI agents, from the moment its functional
documents are ready to a green CI pipeline on the default branch. Start a run with `/storyrail <issue-number>`. The
stage order and gates are in [docs/storyrail/PIPELINE.md](../../docs/storyrail/PIPELINE.md); the agents are Bob custom
modes in `.bob/custom_modes.yaml`, and each mode's brief is in `.bob/rules-<mode-slug>/`.

**How the squad works around it.** The product owner gets the requirement from the business; the functional analyst
writes the **Screen document** (frontend) and the **API document** (backend) and attaches them to the user story in
GitLab, then explains it at the 3 amigos meeting. StoryRail takes over from there, for every application the story touches: requirement analysis, build,
isolated tests, review and quality scans, fixes, merge and CI. Deploying to QA with CDD, the testers' work in QA
(test cases, E2E automation, manual testing) and the sign-off at the sprint review stay with the team.

## Repositories and applications

This repo is the **hub**: agents, dashboard and run records. It contains no product code.

A story touches one or more **existing applications** on your GitLab, named in its **Applications** section, e.g.:

```markdown
## Applications
- INSU-ta01 (task API): new endpoint GET /tasks/{id}/info, reads from the DB
- INSU-fa01 (facade API): new endpoint GET /info/{id}, calls INSU-ta01
- INSU-sp01 (frontend): shows the info screen, calls INSU-fa01
```

`node scripts/storyrail-apps.mjs discover <N>` finds each one in the GitLab group (`gitlab.group`), reads from its repo
whether it is a frontend or a backend, clones or updates it, finds its API contract and tests, works out who calls whom,
and writes `runs/issue-<N>/apps.json`. Nothing about the applications is configured by hand.

| Path | What | Who writes it |
|---|---|---|
| `projects/frontend/<app>/` | A frontend application (its own git repo) | sr-fe-dev (its UI tests: sr-ui-tests) |
| `projects/backend/<app>/` | A backend application (its own git repo) | sr-be-dev (its Cucumber features: sr-api-tests) |
| `<app>/…/openapi*.yaml` | A backend's **own** API contract, the single source of truth for everyone who calls it | sr-req-fetch, from the API document |
| A caller's copy of a provider's contract (`contractCopies` in `apps.json`) | Pinned copy, identical to the provider's | sr-req-fetch |
| `<app>/.gitlab-ci.yml` | The app's GitLab CI (agents don't edit it unless the story is about CI) | — |
| `runs/issue-<N>/apps.json` | The run's applications, their contracts and tests, and the dependency order | storyrail-apps.mjs |
| `runs/issue-<N>/docs/` | The Screen and API documents of the story, downloaded from GitLab | sr-req-fetch |
| `runs/issue-<N>/` | Everything one run produces: spec, review and scan reports, fix responses, release record | all |
| `evals/` | Exams (`/storyrail eval`): practice stories, targets and results. **`evals/hidden/` is the answer key: no mode reads it** | orchestrator, `scripts/storyrail-eval.mjs` |

`projects/` is not part of the hub repo. **GitLab access**: `node scripts/storyrail-gitlab.mjs` with a personal access
token in the variable named by `gitlab.tokenEnv` (default `GITLAB_TOKEN`), or the GitLab MCP server for reads. Never
print the token or write it to a file.

## Commands (all must pass before a stage is done)

Run them from the application's folder. The defaults are in `storyrail.config.json` → `appTypes`; an app's own README
or package.json scripts win when they say otherwise.

```bash
# a frontend application
(cd projects/frontend/<app> && npm ci && npm run lint && npm run typecheck --if-present && npm test && npm run build)
(cd projects/frontend/<app> && npx playwright test)                 # its UI tests, API mocked
# a backend application (Java 21 + Maven 3.9)
(cd projects/backend/<app> && mvn -B verify)                         # unit tests, coverage, static analysis
(cd projects/backend/<app> && mvn -B -q spring-boot:run -Dspring-boot.run.arguments="--server.port=<port>")
(cd projects/backend/<app> && mvn -B verify -Dcucumber.filter.tags="@fa01-AC2")   # one acceptance criterion
```

Applications that run side by side get their own ports (the orchestrator hands them out: frontends from 4173, backends
from 8081, a backend's stub for the apps it calls on its port + 100).

## Conventions every agent follows

- **Leave work notes.** Every agent that changes files writes `runs/issue-<N>/notes/<station>.md` before it replies (see its brief); the dashboard chat answers from them.
- **Stay in your lane.** Each agent writes only to the paths its brief allows. Report problems outside your lane instead of fixing them.
- **Several applications, one story.** Each application in the run gets a branch with the **same name** and its own merge request; they reference the same GitLab issue. They are merged in dependency order: an app is merged only after the apps it calls are merged and green.
- **Documents first.** Build what the Screen and API documents in `runs/issue-<N>/docs/` say. When the code and a document disagree, the document wins; when a document is unclear, ask, don't guess.
- **Contract first, provider owns it.** A backend's API changes go into **its own** contract before any code, written from the API document; every caller keeps an identical copy (`contractCopies`). Callers build against the contract and **stub** the provider in their tests, so all applications can be built at the same time. Field names, status codes and error titles must match the contract exactly.
- **Errors** are RFC 7807 `application/problem+json`; 400s carry `errors: { field: message }`. Never leak stack traces or class names.
- **Frontend:** no `any`, no `dangerouslySetInnerHTML`, no browser dialogs (`alert/confirm/prompt`). Accessible names and roles first; `data-testid` as the fallback hook for tests. Keyboard focus must never land on `<body>` after an action. Respect `prefers-reduced-motion`.
- **API tests:** Gherkin that the analyst can read; one scenario per behaviour; values in tables are JSON literals; fresh data through `${…}` placeholders; every scenario cleans up after itself, so the testers can reuse it against QA. Java steps use constructor injection (PicoContainer) and compile with zero warnings.
- **Backend:** Java records for DTOs, constructor injection only, no Lombok. Inject `java.time.Clock` for anything time-based. Tests: JUnit 5, Mockito, `@WebMvcTest`, `@DataJpaTest`.
- **Tests are tagged with the acceptance criterion they prove**, e.g. `@AC3` in the title, so every AC is traceable.
- **Every bug fix gets a regression test** that fails on the old code.
- **Lint is zero-warning** (ESLint + `eslint-plugin-sonarjs`), TypeScript strict, `npm audit` high = 0.
- **No secrets** in code, tests or logs.

## Reporting progress (every agent)

Report to the live dashboard with the status script (never edit `.storyrail/` by hand):

```bash
node scripts/storyrail-status.mjs set <station> running 30 "short note (≤ 60 chars)"
node scripts/storyrail-status.mjs log <station> ok "one-line result"
node scripts/storyrail-status.mjs set <station> done 100 "headline result, e.g. 24 tests · 96% cov"
```

**Run every command from the hub root.** Use subshells for other folders, e.g. `(cd projects/frontend/INSU-sp01 && npm run lint)`, never a bare `cd`. Git commands for a project run the same way: `(cd projects/backend/INSU-ta01 && git status)`.

Use your own station id only (given in your mode's brief). Report at 3–5 milestones, not on every step.
Statuses: `pending running done failed skipped waiting`. Log levels: `ok warn bad info`.
