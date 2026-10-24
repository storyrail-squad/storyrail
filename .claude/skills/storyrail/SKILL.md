---
name: storyrail
description: Run a backlog issue through the StoryRail agent squad (requirement fetch → FE/BE dev → isolated tests → review + scan → fix → CI/CD to QA → smoke → API acceptance on QA → manual QA → sign-off) across the separate frontend, backend and API-test repos, run the defect loop for bug issues, or give the squad an exam on fixed practice stories. Start manually with /storyrail <issue>, /storyrail fix <bug issues> or /storyrail eval <reason>.
argument-hint: "<issue> [more issues] | fix <bug-issue> [...] | eval <baseline|tool|change> [what changed] | status"
disable-model-invocation: true
---

# StoryRail orchestrator

You are the **orchestrator**. You sequence the agents, enforce the gates, keep the dashboard current and talk to the
product owner (the user). You do **not** write product code or tests yourself: delegate to the `sr-*` subagents.

Arguments: `$ARGUMENTS`

- `status` → run `node scripts/storyrail-status.mjs show` and `node scripts/storyrail-workspace.mjs status`, summarise where the run is, stop.
- `fix <n> [<n> ...]` → **Defect loop** (section D) for those bug issues.
- `eval <baseline|tool|change> [what changed]` → **Exam** (section E): the squad builds the practice stories in `evals/` and hidden tests grade it.
- one or more issue numbers → **Story run** (sections A–C).

Stage definitions and gates: [docs/storyrail/PIPELINE.md](../../../docs/storyrail/PIPELINE.md). Read it once at the start.

## Where things are

Read `storyrail.config.json` once (`node scripts/storyrail-workspace.mjs config`). From it:

- `BACKLOG` = `backlog.repo`: where every story and bug lives. Issue numbers always refer to this repo, so every `gh issue …` gets `-R $BACKLOG`, and a reference from a project PR is written `$BACKLOG#<n>`.
- For each project `L` in `frontend`, `backend`, `apiTests`: `REPO_L` = `projects.L.repo`, `DIR_L` = `projects.L.path` (a separate git repo cloned under the hub), `WF_L` = `projects.L.workflow` (its CI workflow name), and the frontend's `qaUrl`.
- **Lanes and repos.** The `frontend` lane is the frontend repo. The `backend` lane is **two repos**: the backend and the API tests (Cucumber + Java). "For each repo in the run" below means every repo of every lane in the spec.
- The hub (this repo) holds only the run reports in `runs/`.

## Ground rules

- **Keep every summary.** When an agent returns, save its completion summary verbatim to `runs/issue-N/summaries/<station>.md` (a later round or defect loop adds a `## Round <k>` section). Check that its work notes `runs/issue-N/notes/<station>.md` exist; if not, ask it once to write them. Commit both with the run.
- `N` = the first issue number; the run folder is `runs/issue-N/` in the hub. Create it.
- **Shell:** your Bash working directory persists between calls. Always run from the hub root and use subshells for other folders, e.g. `(cd projects/frontend && git status)`. Never leave a `cd` behind.
- **Long waits** (CI, deploys) must not block a single Bash call for more than a few minutes: poll every ~60 s with short commands (see B.6), or run the wait in the background.
- Status: always through `node scripts/storyrail-status.mjs …`. You own the stations `cicd`, `smoke`, `qa-api`, `signoff`, and the run fields (`run phase …`, `run summary …`). Agents own their stations.
- **Parallel stages**: launch both subagents **in the same message** so they run at the same time.
- Give each subagent everything it needs in its prompt: `N`, the run folder, the lanes and their project paths, round number `k`, the QA URL and expected bundle, and the earlier agent's reply when it matters (e.g. new test ids for UI automation).
- After each stage, read the agent's reply and check its gate yourself (run the command if in doubt). A stage that misses its gate is **not done**: send it back once with the exact failure; if it fails again, stop and ask the user.
- **Commits:** agents don't commit. After every stage, commit in **each project that changed** on its run branch (`feat:`, `test:`, `fix:`, `chore:`), and commit `runs/issue-N/` in the hub on the hub's run branch. Never commit on `main` of any repo.
- One short line to the user per stage. Ask the user only at the gates marked **ASK**.

**The quality gate (same rule everywhere):** reviewer verdict `APPROVE` (0 blocker, 0 major) **and** scan with 0 blocker/major findings, 0 lint warnings, 0 secrets, 0 high/critical vulnerabilities. The fixer still fixes minors, but minors alone never block.

## A. Before the agents start

1. **Prerequisites:** `gh auth status`; the hub must be clean (`git status --porcelain` empty; if not, list the files and **ASK** whether to commit, stash or stop); `git switch main && git pull --ff-only`. Then `node scripts/storyrail-workspace.mjs sync`: it clones missing projects and puts every project on an up-to-date `main`. If it reports a project with uncommitted changes, show them and **ASK**.
2. Start the dashboard if it isn't running: `node scripts/storyrail-dashboard.mjs` **in the background** (it exits by itself if already running). Tell the user to open http://localhost:4800.
3. Read the issue: `gh issue view <n> -R $BACKLOG --json number,title,author,url`. Title for display = the issue title without a leading `[Story] ` / `[Bug] ` tag.
4. `node scripts/storyrail-status.mjs start "<issues comma-separated>" "<title>"`, then `run repo $BACKLOG` (the dashboard links issues there).
5. Hub branch: `git switch -c run/N-<slug>` where slug = title lower-cased, only `[a-z0-9-]`, max 40 chars. Project branches come after requirement fetch, once the lanes are known.

## B. The rail

**1. Requirements.** `run phase Requirements`. Run **sr-req-fetch** (mode `story`, with `BACKLOG`). Every run, story or bug, starts here; StoryRail never writes requirements.
Gate: `runs/issue-N/spec.md` exists. If it lists **Open questions** → **ASK** the user, post their answers on the issue (`gh issue comment <n> -R $BACKLOG --body …`), re-run sr-req-fetch.
Then, for each repo in the run: `(cd DIR_L && git switch -c story/N-<slug>)`. Use the **same branch name in every repo**: the API tests' CI runs against the backend branch with the same name. If the contract changed, commit it in each repo now (`feat: API contract for #N`, backend first). Commit the spec in the hub.

**2. Build.** `run phase Build`. Run **sr-fe-dev** and **sr-be-dev** in parallel (only the lanes needed; mark an unneeded lane and its test station `skipped 0 "not in this story"`).
Gate: each dev's commands green. Commit in each project.

**3. Isolated tests.** `run phase "Isolated tests"`. Run **sr-ui-tests** (if fe) and **sr-api-tests** (if be) in parallel.
Gate: green except documented `test.fail()` findings (UI) or `@wip`-tagged findings (API). Product bugs → send to that lane's dev once, then re-run the test agent. Commit in each repo (the API scenarios go to `projects/api-tests`).

**4. Review + scan, round k (start k=1).** `run phase "Review + scan"`. Run **sr-reviewer** (the diff of each repo in the run, `main...HEAD`) and **sr-scan** (round k, the run's lanes) in parallel. **Every round**, save the reviewer's reply as `runs/issue-N/review-round<k>.md`.
Then `findings <blocker> <major> <minor> <fixed-so-far>` (both reports combined; the three severities count the findings **still open**, so after a clean re-check it is `findings 0 0 0 <fixed>`).

**5. Fix.** `run phase Fix`. If both reports are already clean (no findings at all) → `set fixer skipped 0 "nothing to fix"`. Otherwise run **sr-fixer** with k, update `findings … <fixed>`, commit in each changed repo, and go back to step 4 with k+1.
Gate: the quality gate above. Max 2 fix rounds; still failing → **ASK** the user with the open findings.

**6. CI/CD → QA.** `run phase "CI/CD"`, `set cicd running 10 "opening PRs"`. One PR per repo in the run.
- For each repo in the run: `(cd DIR_L && git push -u origin HEAD && gh pr create --title "<type>: <title>" --body "<ACs of this lane, link to runs/issue-N in the hub>\n\nPart of $BACKLOG#N")` (**not** "Closes": the story closes at sign-off). Note each PR number and its repo.
- Wait for checks to appear: poll `gh pr checks <pr> -R REPO_L` every 10 s (max 2 min). Then poll every 60 s until none is pending (`gh pr checks <pr> -R REPO_L --json name,state,bucket`).
- The backend PR's `API acceptance (Cucumber, isolated)` check runs the API tests' **`main`**, so new scenarios are not in it yet; the API-tests PR runs the new scenarios against the backend branch of the same name. Both must be green.
- **Contract changed?** The frontend's `contract` check compares with the backend's `main`, so it fails until the backend PR is merged. That one failure is expected; every other check must be green.
- Any other failed check → `gh run view <run-id> -R REPO_L --log-failed | tail -n 80`, send the failure to the right agent, commit, push, wait again.
- Green → **ASK** once: "PRs are green: backend #X, API tests #Z, frontend #Y. Merge and deploy to QA?" (list only the repos in the run). On yes, in this order:
  1. **Backend:** `gh pr merge <pr> -R REPO_backend --squash --delete-branch`; `sha=$(gh pr view <pr> -R REPO_backend --json mergeCommit -q .mergeCommit.oid)`; poll `gh run list -R REPO_backend --commit $sha --json databaseId,workflowName,status,conclusion` until the `WF_backend` run appears, then until it is `completed`. It builds, re-tests, deploys to QA, smoke-tests, and runs the `@qa` scenarios that are already on the API tests' `main`.
  2. **API tests:** merge the same way and wait for the `WF_apiTests` run on its merge commit. On `main` it runs the isolated suite again and, when a QA backend exists, the **QA run** with the new `@qa` scenarios.
  3. **Frontend:** if the contract changed, first re-run the frontend PR's failed checks (`gh run rerun <run-id> -R REPO_frontend --failed`) and wait until all are green. Then merge it and wait for its `WF_frontend` run on the merge commit.
  4. `node scripts/storyrail-workspace.mjs sync` to bring the projects back to `main`.
- Any run not `success` → `set cicd failed`, show the failing job, stop and **ASK**. All success → `set cicd done 100 "merged <repo>#<pr> … · deployed"`.

**7a. Smoke.** `run phase QA`. Each project's pipeline smoke-tests its own QA deploy:
- Frontend deployed: read the `Smoke test (QA environment)` job of that frontend run (`gh run view <id> -R REPO_frontend --json jobs`), and get the served bundle name from its log line `Smoke test passed: … assets/<name>.js` (`gh run view <id> -R REPO_frontend --log | grep "Smoke test passed"`).
- Backend deployed: the `deploy-render` job's "Smoke test GET /api/books" step; if that job was skipped (no Render configured), say so.
- Every deployed lane passed (or backend skipped for lack of an env) → `set smoke done`. Any failed → `set smoke failed`, stop and report: the deploy is broken.

**7b. API acceptance on QA.** `set qa-api running 10 "@qa scenarios on QA"`. The gate is the newest QA run of the `@qa` scenarios:
- API tests merged in this run: the `QA run (deployed API, @qa)` job of the `WF_apiTests` run from step 6.2 (`gh run view <id> -R REPO_apiTests --json jobs`).
- Otherwise: the `API acceptance on QA (Cucumber, @qa)` job of the backend run from step 6.1.
- Job skipped because no QA backend exists (backend `BACKEND_URL` / API tests `QA_API_URL` not set) → `set qa-api skipped 0 "no backend QA env"`. Frontend-only story → `set qa-api skipped 0 "no backend change"`.
- Passed → `set qa-api done 100 "<n> @qa scenarios green"`. Failed → `set qa-api failed`, show the failing scenarios (from the job log or the `api-acceptance-qa` report artifact), stop and **ASK**: it is a defect on QA (triage, C.1) or a test problem (back to sr-api-tests).

**7c. Manual QA.** Before starting, check what QA can see: the frontend QA site runs in **demo mode** (in-browser mock API) unless the frontend repo variable `API_BASE_URL` points at the deployed backend. Ask the user once per session if you can't tell. If QA is demo-only, tell sr-manual-qa to test the frontend on the QA URL and to check backend ACs against the backend's `BACKEND_URL` with curl if one exists, else mark them "not testable in QA".
Run **sr-manual-qa** with the frontend QA URL (`projects.frontend.qaUrl`) and the expected bundle name.
Gate: no open blocker/major. Otherwise → triage (C.1).

**8. Sign-off.** `run phase "Sign-off"`, `set signoff waiting 0 "your decision"`. **ASK** the user to approve. See C.

## C. Triage and sign-off

1. **Triage** (Manual QA logged defects): show the defects table. **ASK** which to fix now (recommend: all blocker/major; minor/low to backlog unless cheap). For each, in the backlog repo: `gh issue create -R $BACKLOG --label bug [--label backlog] --title "[Bug] …" --body "<steps, expected, actual, evidence path, which project>\n\nFound in QA for #N"`. Run the **defect loop** (D) for the fix-now issues *as part of this run*, then come back to step 8.
2. **Approve** →
   - Save the run records in the hub: commit `runs/issue-N/` on the hub branch, push, `gh pr create --body "Run records for $BACKLOG#N"`, wait for checks, `gh pr merge --squash --delete-branch`, `git switch main && git pull --ff-only`.
   - Comment a summary on every story issue (what was built per project, PR links in both repos, test counts, findings fixed, QA result, backlog issues) and close it: `gh issue close <n> -R $BACKLOG --reason completed`.
   - `set signoff done 100 "approved"`, `run phase Done`, `end`.
3. **Not approved** → ask what's missing. A requirement change is a new or edited issue and goes back to step 1; a defect goes to triage.

## D. Defect loop (`/storyrail fix <bug issues>`, or from triage)

Shorter rail; only the project the bug touches.

1. Run **A.1** (prerequisites). Then:
   - Started standalone (`/storyrail fix …`): `start "<bugs>" "Defect loop: <title>"`, `run repo $BACKLOG`, B = first bug number, run folder `runs/issue-B/`, hub branch `run/B-<slug>`.
   - Started from triage: **don't** call `start` (it would wipe the story). Use `loop <bugs>` (resets the stations from requirement fetch to QA, keeps the run's issues and metrics); the run folder stays `runs/issue-N/` with a `bugs-<B>/` subfolder, on the story's hub branch.
   - `run phase Requirements`. Run **sr-req-fetch** in mode `bug` with the bug issue(s), `BACKLOG`, the run folder and (from triage) the story number N. It writes the bug spec with ACs `BUG-<n>` and its lane. Open questions → **ASK**, as in B.1.
   - In the affected lane's repos only (backend = backend + API tests): `(cd DIR_L && git switch -c fix/<B>-<slug>)`, same name in each.
2. Run only the affected lane's dev with the bug spec; skip the other lane and its tests.
3. That lane's test agent adds a **regression test that fails on the old code** (tag `@BUG-<n>`; for the backend, a Cucumber scenario in `projects/api-tests`, also tagged `@qa`).
4. Review + scan **on that project's diff only**, then fixer if needed (max 2 rounds, same quality gate).
5. PR in the affected project's repo with `Fixes $BACKLOG#<bug>` (GitHub closes the backlog issue when it merges); for a backend bug, the regression scenario goes in a second PR in the API tests repo with `Part of $BACKLOG#<bug>`. Checks, **ASK** before merge, merge in the B.6 order, deploy, smoke and API acceptance on QA (as B.6–7b).
6. **sr-manual-qa re-test**: each defect's steps plus a quick regression around it → `qa-retest.md`. Verified → comment "Verified on QA" on each bug (`gh issue comment <bug> -R $BACKLOG`). Not fixed → `gh issue reopen <bug> -R $BACKLOG` and **ASK** how to proceed.
7. Standalone: commit the run records in the hub as in C.2 (first bullet). From triage: return to the story's sign-off (B.8).

## E. Exam (`/storyrail eval <baseline|tool|change> [what changed]`)

Evaluation-driven development: before you trust a change to the squad (a Claude Code update, an edited brief, rule or
skill), the squad takes the same exam as before and the scores are compared. Background: [evals/README.md](../../../evals/README.md).

- **What is graded:** the practice stories in `evals/evals.json`, built from frozen commits, each `runsPerStory` times. Hidden
  tests in `evals/hidden/` grade every run. **Never open, list, search or quote anything under `evals/hidden/`**, and never
  pass it to an agent: the answer key must stay unseen (`.claude/settings.json` denies reading it too).
- **Nothing leaves the machine:** no push, no PR, no merge, no deploy, no backlog comment. Exam branches (`eval/…`) are local.

1. **Prerequisites** as A.1 (but no `git switch -c` in the hub: exam records are committed at the end). `node scripts/storyrail-eval.mjs validate`.
   Start the dashboard as A.2. `reason` = `baseline` (first exam, or after you reset the targets), `tool` (Claude Code or
   model update, your setup unchanged) or `change` (a brief, rule, skill or config changed: name it). If unclear, **ASK**.
2. `node scripts/storyrail-eval.mjs start --reason <reason> --detail "<what changed>"`. Tell the user it takes about
   (stories × runs) story runs and that the dashboard shows an EVAL banner meanwhile.
3. For each story `S` in `evals.json`, for run `k` = 1 … `runsPerStory`:
   1. `node scripts/storyrail-eval.mjs prepare S k`: frozen code on a local branch in each project, run folder
      `runs/eval-<exam>-S-r<k>/` with the story as `story.md`, the dashboard banner.
   2. Run **B.1 to B.5** exactly as for a real story, with these differences:
      - sr-req-fetch gets mode `eval` and the story file instead of an issue; its run folder is the exam run folder.
      - **No questions to the user.** The story's "Answers the squad already has" section answers refinement questions. If an
        agent still needs a decision, decide yourself from the story, note it in the run folder, and count **1 human
        intervention** for every time the run needed you; only a hard stop (gate failed twice) is asked, and counts too.
      - Every agent starts fresh for every run (no memory of earlier runs): that is what makes runs comparable.
      - Skip the branch creation in B.1: each project is already on its exam branch. Commit there after each stage, as usual; never push.
      - Note for the grade: **major** = blocker + major findings of the round-1 review and scan; **rounds** = fix rounds run.
   3. `node scripts/storyrail-eval.mjs grade S k --major <n> --rounds <n> --human <n>`: it starts the backend from the run's
      code, runs the hidden tests, records the result. One line to the user: `S run k: <passed>/<tests> hidden tests`.
4. `node scripts/storyrail-eval.mjs finish`: verdict against the previous exam (or the targets for a baseline), projects
   back on their branches, banner off. Show the verdict to the user as it prints.
5. Commit `evals/results/<exam>.json` and `runs/eval-<exam>-*` in the hub on a branch `eval/<exam>`, push, PR, merge (the
   result is what the next exam compares with). The Evals tab on the dashboard shows the history.
6. Verdict **worse** after a `change` → recommend reverting it; after a `tool` update → recommend pinning the previous
   version and keeping the exam as evidence. Never edit the hidden tests or the targets to make an exam pass.

## Finish

End every run with a short summary: what was built in each project, PR link(s) per repo, test totals, findings fixed, QA result, backlog issues created, and anything the user needs to do next.
