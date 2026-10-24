<p align="center"><img src="docs/brand/storyrail-wordmark.svg" alt="StoryRail: from user story to green CI" width="420"></p>

# StoryRail

**StoryRail** puts a user story on rails: a squad of specialised AI agents in **IBM Bob** takes it from the moment the
functional documents are ready in GitLab to a **green CI pipeline** on the default branch, with a quality gate at every
stage in between and you deciding at the two points that matter (clarifications and the merge).

## Where StoryRail fits in the squad

| Who | What | With StoryRail? |
|---|---|---|
| **Product owner** | Gets the requirement from the business | Outside: people |
| **Functional analyst** | Writes the **Screen document** (frontend) and the **API document** (backend), attaches them to the user story in GitLab, explains it at the 3 amigos meeting | Outside: people |
| **StoryRail** | Steps 1–7 below, from the GitLab story to green CI | **The agents** |
| **The team** | Deploys to QA with CDD | Outside: CDD can't be followed from here |
| **Testers** | Prepared test cases, E2E UI and API automation and manual tests in QA; log defects as GitLab bugs | Outside; bugs come back through the defect loop |
| **Analyst + PO** | Review the implementation at the sprint review and sign off | Outside: people |

## The rail

| # | Stage | Who |
|---|---|---|
| 1 | Requirement analysis | You run `/storyrail <issue>` → **Sindhu** reads the GitLab story and its Screen and API documents. Anything unclear: she asks, the orchestrator asks **you** in the chat and posts the answers on the issue |
| 2 | Build | One developer per application the story names, **all at the same time**, each with unit tests, against its providers' contracts with the providers stubbed |
| 3 | Isolated tests | Per app: **UI automation** (frontend, API mocked) ∥ **API automation** (backend running locally, providers stubbed) |
| 4 | Review + scans | **Tech lead review** (read-only) ∥ **Quality scans**: Sonar, Fortify and NexusIQ, locally or through the branch pipeline |
| 5 | Fix | **The developers** fix the findings of their own app, side by side |
| 6 | Re-run tests + re-check | The test agents of the changed apps re-run their suites on the fixed code, then review and scans again; max 2 fix rounds |
| 7 | Merge + CI | One merge request per app; **you approve the merge**; providers first (e.g. INSU-ta01, INSU-fa01, INSU-sp01); StoryRail follows each GitLab CI pipeline on the default branch until it is green |

The story is then commented and labelled **Ready for QA**. Bugs the testers log go through the **defect loop**
(`/storyrail fix <bug>`): the same rail for the affected app only, with a regression test. Details:
[docs/storyrail/PIPELINE.md](docs/storyrail/PIPELINE.md).

**Exams (evaluation-driven development).** When IBM updates Bob, or you change a mode, a rule, the house standards or an
MCP server, `/storyrail eval` makes the whole squad build fixed practice stories from frozen code, three times each, and
hidden tests the agents never see grade every run. Nothing is pushed or merged. The **Evals** tab compares the score with
the previous exam and says whether to keep the change: [evals/README.md](evals/README.md).

## How to run it

One-time setup: [docs/storyrail/SETUP.md](docs/storyrail/SETUP.md) (GitLab token, the projects and the scanners in
`storyrail.config.json`). Run **one story or bug at a time**: the dashboard and your working folder follow a single run.

**Before each run**

```bash
cd storyrail
git switch bob && git pull
node scripts/storyrail-gitlab.mjs whoami      # GitLab and your token work
node scripts/storyrail-workspace.mjs sync     # references only; the story's apps are cloned by the run itself
node scripts/storyrail-dashboard.mjs          # leave this terminal open
```

Open the `storyrail` folder in **IBM Bob**, and **http://localhost:4800** on a second screen.

### A. A user story

1. **The story is ready in GitLab:** the story, numbered acceptance criteria, the **Frontend** / **Backend** ticks, and
   the **Screen document** and **API document** attached (template: `docs/storyrail/gitlab-templates/`). Note the number, e.g. **#51**.
2. **Start the run** in the Bob chat: `/storyrail 51`.
3. **Answer when it stops.** It only pauses here:

   | When | It asks | You answer |
   |---|---|---|
   | Requirement analysis | Questions about the story or the documents (only if any) | Your answers, after checking with the analyst or PO if needed; they're posted on the issue |
   | Before merge | "Merge requests are green: backend !X, API tests !Z, frontend !Y. Merge them and run CI on main?" | **yes** |
   | Something fails twice | What went wrong and what it needs from you | Your call |

4. **Result:** each repo's merge request is merged, every CI pipeline on the default branch is green, the issue has a
   summary comment and the **Ready for QA** label, and the run's records are in `runs/issue-51/` (with a merge request
   for the hub). Deploying with CDD and testing in QA is then up to the team.

### B. A bug the testers found

1. The testers log it in GitLab: steps to reproduce, expected, actual, and the lane. Note the number, e.g. **#60**.
2. `/storyrail fix 60`.
3. Same pauses as above. Only the affected project gets a merge request, with a regression test.
4. **Result:** merged, CI green, the bug is commented "ready for re-test in QA". The testers re-test it after the CDD deployment.

### Handy anytime

| Want to… | Type |
|---|---|
| See where a run is | `/storyrail status` |
| Resume after you fixed or answered something | `continue` |
| See what's left to configure | `node scripts/storyrail-workspace.mjs todo` |

## What's in this repo

| Path | What |
|---|---|
| `storyrail.config.json` | GitLab, backlog and project repos, scanners, merge settings, the squad |
| `.bob/custom_modes.yaml`, `.bob/rules-sr-*/`, `.bob/commands/storyrail.md` | The agents as IBM Bob custom modes (with per-lane edit limits), their briefs and the `/storyrail` command; conventions in [.bob/rules/01-project-guide.md](.bob/rules/01-project-guide.md) |
| `scripts/storyrail-gitlab.mjs` | GitLab for the agents: issues and attachments, comments, labels, merge requests, merges, pipelines (personal access token) |
| `scripts/storyrail-workspace.mjs` | Clones/updates the project repos into `projects/` |
| `scripts/storyrail-lanes.mjs` | Checks that agents running side by side stayed in their lanes |
| `scripts/storyrail-status.mjs`, `scripts/storyrail-dashboard.mjs`, `storyrail-dashboard/` | Live dashboard (http://localhost:4800): the orchestrator handing out work, the squad with a chat per member, and the rail diagram, including what happens outside StoryRail |
| `docs/demo/index.html` | Stand-alone demo replay with sample data: open the file, no server or network needed (`node scripts/storyrail-build-demo.mjs` rebuilds it) |
| `evals/`, `scripts/storyrail-eval.mjs` | Exams: practice stories, hidden tests (the answer key), targets and every exam's results ([evals/README.md](evals/README.md)) |
| `docs/brand/` | Logo: the S-Track mark, favicon and wordmark (light and dark); `storyrail-rails.svg`/`.png` is the 1280×640 title card for slides and presentations |
| `runs/issue-<N>/` | Every run's documents, spec, review and scan reports, fix responses, work notes and release record |
| `docs/storyrail/` | [Pipeline and gates](docs/storyrail/PIPELINE.md), [setup](docs/storyrail/SETUP.md), GitLab issue templates |
