# StoryRail project guide

StoryRail takes a user story or a bug (a GitHub issue in the squad backlog, written by the analyst) through a squad
of agents to a signed-off release. Start a run with `/storyrail <issue-number>`. The stage order and gates are in
[docs/storyrail/PIPELINE.md](docs/storyrail/PIPELINE.md); the agents are in `.claude/agents/sr-*.md`.

A story can touch **any number of existing applications** that call each other, each in its own repo with its own
pipeline. The story names them in its **`## Applications`** section; StoryRail finds them on GitHub, so nothing is
configured per application. The demo product is a **Library Catalog** (books: browse, search, filter, add, delete, loan
toggle): a backend and a frontend that calls it.

## Repositories and applications

This repo is the **hub**: agents, dashboard and run reports. It contains no product code.

- **Backlog:** `storyrail-squad/squad-backlog` (`backlog.repo` in [`storyrail.config.json`](storyrail.config.json)): stories
  and bugs only, read with `gh issue view <n> -R <backlog>`.
- **Applications** are repos in the GitHub org `github.org` (`storyrail-squad`). A story's Applications section names
  them, e.g. `- library-backend (books API): …` and `- library-frontend (catalog app): …, calls library-backend`.
  `node scripts/storyrail-apps.mjs discover <N>` finds each repo, tells frontend (package.json) from backend (pom.xml),
  clones it into `projects/<frontend|backend>/<app>`, finds its contract, contract copies and tests, works out who calls
  whom and writes `runs/issue-<N>/apps.json`. `storyrail-apps.mjs show <N>` prints it.
- `apps.map` in the config only covers what the repo can't tell: a backend whose API tests live in **a repo of their own**
  (library-backend → `storyrail-squad/library-api-tests`, cloned into `projects/api-tests/library-api-tests`), a QA URL.

| Application | Repo | Local path (from the hub root) | Deploys to |
|---|---|---|---|
| Backend, **owns its API contract** | `storyrail-squad/library-backend` | `projects/backend/library-backend/` | Render (QA) |
| Its API acceptance tests (Cucumber + Java) | `storyrail-squad/library-api-tests` | `projects/api-tests/library-api-tests/` | – (runs isolated on every backend PR, and `@qa` against the QA API after each deploy) |
| Frontend, calls the backend | `storyrail-squad/library-frontend` | `projects/frontend/library-frontend/` | GitHub Pages (QA) |

`projects/` is not part of the hub repo. Each app folder is its own git repo with its own branches, PRs and pipelines.

## Workspace map

| Path | What | Owner agent |
|---|---|---|
| `projects/frontend/<app>/src/` | React 18 + TypeScript (strict), Vite, React Router (HashRouter), Vitest + RTL | sr-fe-dev |
| `projects/frontend/<app>/tests/ui/` | Playwright UI automation: `chromium` project (mocked API via `page.route`) + `demo` project (demo build) | sr-ui-tests |
| `projects/frontend/<app>/contract/openapi.yaml` | Pinned copy of the contract of the backend it calls; the frontend CI fails if it differs from that backend's `main` | sr-req-fetch copies it |
| `projects/backend/<app>/src/` | Java 21, Spring Boot 3.5, Maven, Spring Data JPA, H2, Bean Validation, ProblemDetail errors | sr-be-dev |
| `projects/backend/<app>/docs/api/openapi.yaml` | The backend's API contract, **single source of truth** for it, its callers and its API tests | sr-req-fetch proposes, devs implement |
| `projects/api-tests/<repo>/src/test/resources/features/` | Cucumber scenarios (Gherkin), tagged per AC (`@BE-AC3`); `@qa` = also run against the QA API | sr-api-tests |
| `projects/api-tests/<repo>/src/test/java/` | Step definitions (RestAssured), contract validation, test data | sr-api-tests |
| `projects/api-tests/<repo>/contract/openapi.yaml` | Pinned copy of the backend's contract (CI fails if it differs) | sr-req-fetch copies it |
| `projects/*/.github/workflows/` | Each project's `ci-cd.yml` (build, test, deploy to QA, smoke) and `security.yml` (CI only — agents don't edit these unless the story is about CI) | — |
| `runs/issue-<N>/apps.json` | The run's applications, their contracts and tests, and the dependency order | storyrail-apps.mjs |
| `runs/issue-<N>/` | Everything one run produces: spec, review and scan reports, fixer responses, QA log | all |
| `evals/` | Exams (`/storyrail eval`): practice stories, targets and results. **`evals/hidden/` is the answer key: no agent reads it** | orchestrator, `scripts/storyrail-eval.mjs` |
| `tests/manual/` | Manual QA records of the first run | sr-manual-qa |
| `docs/history/run-1/` | Archive of the first, hand-orchestrated run (old briefs and reviews, old monorepo paths) — read-only reference | — |

## Commands (all must pass before a stage is done)

Per kind of app (`appTypes` in the config), run in the app's folder. For the Library Catalog:

```bash
# a frontend app
(cd projects/frontend/library-frontend && npm ci && npm run lint && npm run typecheck && npm run test:coverage && npm run build && npm audit --audit-level=high)
# a backend app (needs Java 21 + Maven 3.9)
(cd projects/backend/library-backend && mvn -B verify)          # unit tests, JaCoCo ≥ 80 %, SpotBugs, PMD, Checkstyle (warnings)
(cd projects/backend/library-backend && mvn spring-boot:run)    # http://localhost:8080, H2 seeded
# UI automation (builds the app itself; needs the frontend's own deps installed)
(cd projects/frontend/library-frontend/tests/ui && npm ci && npm run lint && npm run typecheck && npx playwright test)
# API acceptance tests, Cucumber + Java (the backend must be running)
(cd projects/api-tests/library-api-tests && mvn -B verify)                                    # all scenarios, against http://localhost:8080
(cd projects/api-tests/library-api-tests && mvn -B verify -Dcucumber.filter.tags="@BE-AC3")   # one acceptance criterion
(cd projects/api-tests/library-api-tests && mvn -B verify -Dapi.baseUrl=<QA URL> -Dcucumber.filter.tags="@qa")   # the QA subset against QA
```

First time on a machine: `gh auth login`, then `npx playwright install chromium` once. The apps are cloned by the first run.

## Conventions every agent follows

- **Leave work notes.** Every agent that changes files writes `runs/issue-<N>/notes/<station>.md` before it replies (see its brief); the dashboard chat answers from them.
- **Stay in your lane.** Each agent writes only to the paths its brief allows. Report problems outside your lane instead of fixing them.
- **Several apps, one story.** A story can touch any number of apps. Every repo of the run (each app, and a backend's API-tests repo) gets a branch with the **same name** and its own PR; they reference the same backlog issue. Apps are built **at the same time**, each against the contracts of the apps it calls, with those apps mocked or stubbed in its tests.
- **Contract first.** API changes go into the backend's own contract (`docs/api/openapi.yaml`) before code, and the same file is copied over every copy (in each app that calls it and in its API-tests repo; `contractCopies` in apps.json). Field names, status codes and problem titles must match it exactly. **Merge order = dependency order:** providers first, each backend followed by its API-tests repo, then the apps that call it (`storyrail-apps.mjs repos <N>`).
- **Errors** are RFC 7807 `application/problem+json`; 400s carry `errors: { field: message }`. Never leak stack traces or class names.
- **Frontend:** no `any`, no `dangerouslySetInnerHTML`, no browser dialogs (`alert/confirm/prompt`). Accessible names and roles first; `data-testid` as the fallback hook for tests. Keyboard focus must never land on `<body>` after an action. Respect `prefers-reduced-motion`.
- **API tests:** Gherkin that the analyst can read; one scenario per behaviour; values in tables are JSON literals; fresh data through `${…}` placeholders; every scenario cleans up after itself, so it is safe against QA. Java steps use constructor injection (PicoContainer) and compile with zero warnings.
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

**Run every command from the hub root.** The Bash working directory persists between calls, so use subshells for other folders, e.g. `(cd projects/frontend/library-frontend && npm run lint)`, never a bare `cd`. Git commands for a project run the same way: `(cd projects/backend/library-backend && git status)`.

Use your own station id only (given in your agent file; developers and test agents use `dev@<app>` / `tests@<app>` with the app the orchestrator gave them). Report at 3–5 milestones, not on every step.
Statuses: `pending running done failed skipped waiting`. Log levels: `ok warn bad info`.
