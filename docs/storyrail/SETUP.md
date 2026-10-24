# Run StoryRail with IBM Bob (macOS, office GitLab)

StoryRail runs inside **IBM Bob**. Each agent is a Bob **custom mode** that ships with this repo, and you start each run
yourself with `/storyrail <issue number>` in the Bob chat. It starts once the user story and its Screen and API
documents are in GitLab, and ends when the merged code's GitLab CI pipeline is green.

## What's in `.bob/`

| File | What it does |
|---|---|
| `.bob/custom_modes.yaml` | The 8 StoryRail modes (orchestrator + 7 agents). Each mode may only **edit** its own folders (`fileRegex`), e.g. the frontend dev only the frontend apps in `projects/frontend/<app>/` (not their contracts or CI files), so "stay in your lane" is enforced, not just asked. The reviewer has no edit rights at all. |
| `scripts/storyrail-lanes.mjs` | The same lanes as a check for the parallel stages, which run as subagents: `lanes` lists them, `check <lanes>` fails on any file changed outside them. |
| `.bob/rules/01-project-guide.md` | Project conventions, loaded in every mode. |
| `.bob/rules-<mode>/01-brief.md` | The full brief of one mode (what to do, gates, what to report). |
| `.bob/commands/storyrail.md` | The `/storyrail` command: switches to the orchestrator mode and passes your arguments. |
| `.bobignore` | Files Bob must never read (`.env`, keys, and `evals/hidden/`: the answer key of the exams). |
| `.bob/rules/02-house-standards.md` | Your company's design-system and backend coding standards. Off until switched on in `storyrail.config.json`; see "Optional: design system and reference app". |
| `.bob/mcp.example.json` | Template for MCP servers (Figma, Storybook; add your GitLab MCP server here too); copy it to `.bob/mcp.json`. |

## 1. One-time setup

### Tools

Node 18 or newer, Git, Java 21 and Maven 3.9, the way your company provides them (Self Service, an internal
Homebrew mirror, …). Nothing else is required: the StoryRail scripts use only Node's built-in modules, and GitLab is
reached with a token, no CLI to install.

Check: `node -v` (18+), `java -version` (21), `mvn -v` (3.9+ **with Java 21**), `git --version`.

For the quality scans you need your company's scanners on the machine if you run them locally (see section 3).

### Git identity (once per machine)

```bash
git config --global user.name "Your Name"
git config --global user.email "you@company.com"
```

### GitLab token

Create a **personal access token** in GitLab (avatar → Preferences → Access tokens) with the scope **`api`**, and make it
available to every terminal and to Bob:

```bash
echo 'export GITLAB_TOKEN=<your token>' >> ~/.zprofile    # the variable name is gitlab.tokenEnv in the config
source ~/.zprofile
```

If your GitLab uses a company certificate that Node doesn't know, point Node at it once:
`echo 'export NODE_EXTRA_CA_CERTS=/path/to/company-ca.pem' >> ~/.zprofile` (ask your IT for the file).

**GitLab MCP server.** If your office provides a GitLab MCP server, add it to `.bob/mcp.json` (or Bob's MCP settings)
under the name in `gitlab.mcpServer` (default `gitlab`). The orchestrator and requirement analysis may then read issues
and pipelines through it; every write (comments, labels, merge requests, merges) still goes through
`scripts/storyrail-gitlab.mjs` with the token, so the token is needed either way.

### The repos

Put the hub (this repo) and the projects on your GitLab. Then fill in `storyrail.config.json`:

| Key | What to set |
|---|---|
| `gitlab.url` | Your GitLab address, e.g. `https://gitlab.company.com` |
| `backlog.project` | The GitLab project with the user stories and bugs, e.g. `squad/backlog` |
| `backlog.readyLabel` | The label a finished story gets (default `Ready for QA`) |
| `hub.project` | This repo on GitLab |
| `gitlab.group` | The GitLab group your applications live in, e.g. `insu`. Apps are found there by name, so there is **no per-app setup** |
| `apps.map` | Only for an app whose story name doesn't match its GitLab project: `"INSU-ta01": "insu/tasks/insu-ta01-api"`. Usually empty |
| `appTypes.frontend` / `backend` | How every app of that type is verified, run, tested and stubbed (`npm`/`mvn` commands); one setting for all apps |
| `build.mode` | `parallel` (all apps at once, default) or `sequential` |
| `mergeRequests` | Squash, remove the source branch, wait for the MR pipeline (merge order comes from the apps' dependencies) |
| `scans` | See section 3 |

`node scripts/storyrail-workspace.mjs todo` lists every `TODO(office)` value still to fill in. Then:

```bash
node scripts/storyrail-gitlab.mjs whoami        # "signed in as …": the URL and the token work
node scripts/storyrail-apps.mjs discover 0 --apps "INSU-ta01"   # optional dry run: finds and clones one app
npx playwright install chromium                 # once, for the UI automation
```

**Issue templates.** Copy `docs/storyrail/gitlab-templates/*.md` to `.gitlab/issue_templates/` in the backlog project, so
every story has the same shape: story, acceptance criteria, the **Applications** section and the attached documents.
The Applications section is what tells StoryRail which apps to build: one bullet per app, `- INSU-fa01 (facade, calls INSU-ta01)`.
If it's missing, Sindhu proposes the apps from the documents and asks you.

### IBM Bob

1. Install and sign in to IBM Bob (IDE) the way your organisation provides it.
2. **File → Open Folder… →** the `storyrail` folder (the hub root, not a subfolder and not a project in `projects/`).
3. Open the mode selector in the chat. You should see the eight **StoryRail · …** modes. If not, open
   Settings → Modes → *Edit Project Modes*: it should show `.bob/custom_modes.yaml`. A YAML error there hides all of them.
4. Type `/` in the chat: **`/storyrail`** should be in the list.

### Permissions (Permissions button, next to the mode selector)

StoryRail runs many small steps, so approve the routine ones and keep the risky ones manual:

| Action | Setting | Why |
|---|---|---|
| Read | auto-approve | Reading code, specs and documents |
| Edit | auto-approve | Each mode can only edit its own folders anyway |
| Todo | auto-approve | Progress list |
| Subtask | auto-approve | The orchestrator hands each stage to its mode |
| Mode | auto-approve | `/storyrail` switches to the orchestrator mode |
| Subagent | auto-approve | Runs the parallel stages (one build, test and fix agent per app, review ∥ scans); the lane check guards them |
| MCP | auto-approve for read tools | GitLab and Figma reads |
| Execute | **ask** at first | Look at what it runs during your first story; auto-approve once you trust it |

Whatever you allow, the orchestrator still **stops and asks you** when the story is unclear and before merging. Never
approve `git push --force`, `git reset --hard` or anything that deletes outside the repo.

## 2. Each story

Run **one story or bug at a time**: the dashboard and your working folder follow a single run.

1. **The story is ready:** the functional analyst created it in the backlog project with the *User story* template and
   attached the **Screen document** and the **API document**. StoryRail never writes or changes requirements.
2. Start the dashboard in a terminal and leave it open: `node scripts/storyrail-dashboard.mjs`, then open
   **http://localhost:4800**. Keep it on a second screen during a demo.
3. In Bob's chat: `/storyrail 51`.
4. Answer when it stops:
   - **questions** about the story or the documents (answer them, after checking with the analyst or PO if needed; they
     are posted on the issue),
   - **"Merge requests are green: backend !X, API tests !Z, frontend !Y. Merge them and run CI on main?"**,
   - anything that failed twice.
5. When it's done: the story has a summary comment and the **Ready for QA** label, every CI pipeline on the default
   branch is green, and the run's records are in `runs/issue-51/` with a merge request for the hub. Deploying with CDD
   and testing in QA is then up to the team.
6. Bugs the testers log: `/storyrail fix 60`. Where is a run? `/storyrail status`.

## 3. Quality scans: Sonar, Fortify, NexusIQ

Steps 4 and 6 run your company's three scanners. Each one has a **mode** in `storyrail.config.json` → `scans`:

| Mode | What happens | Needs |
|---|---|---|
| `local` (default) | The scan runs on your machine before anything is pushed: the fastest feedback | The scanner on your machine and its token |
| `ci` | The run branch is pushed (not merged), its GitLab pipeline runs the scan job (`ciJob`), StoryRail reads the result | A scan job in the project's `.gitlab-ci.yml` that runs on branches |
| `off` | Skipped; the report says so | – |

**Can they run locally?** Usually yes, with what your company already licenses:

- **Sonar:** the Maven plugin (`mvn sonar:sonar`) or `sonar-scanner` against your SonarQube, with a token in
  `SONAR_TOKEN` and the server in `SONAR_HOST_URL`. `-Dsonar.qualitygate.wait=true` makes the command fail when the
  quality gate fails. Analysing a branch other than main needs a SonarQube edition with branch analysis; otherwise use
  a separate project key for local scans. (SonarLint in your IDE gives the same rules while you type, but no gate.)
- **Fortify:** either Fortify SCA on your machine (`sourceanalyzer` translates and scans, writing an FPR; `FPRUtility`
  lists the critical and high issues), or the **ScanCentral client**, which packages the code locally and lets the
  ScanCentral server do the scan, so you don't need the full SCA install.
- **NexusIQ:** the **NexusIQ CLI** (`nexus-iq-cli.jar`) evaluates your dependencies against your IQ server's policies
  from your machine (`-s <server> -a <user:token> -i <application id> -t build`) and writes a JSON report.

Put the exact commands your team uses in `scans.<tool>.commands` (per project), the tokens in environment variables
(`SONAR_TOKEN`, `NEXUS_IQ_TOKEN`, … in `~/.zprofile`, never in the config), and keep `mode: local`. If a scanner can't
run on your machine, set its mode to `ci`. The gates are in `scans.<tool>.gate`: a scanner that is on but couldn't run
means the gate is **not** met, so nothing is merged on an unscanned change.

## Optional: design system and reference app

Two optional additions make the developers work the way your squad does. Both are **off** until you switch them on, and
`node scripts/storyrail-workspace.mjs todo` lists their placeholders too.

**Frontend: screens from the Storybook components, through the Figma MCP server**

1. MCP server: copy `.bob/mcp.example.json` to `.bob/mcp.json` (git-ignored) and set your Figma-to-code server, or add it
   in Bob's MCP settings. The name must match `designSystem.figmaMcpServer` (default `figma`). Add a Storybook server
   only if your Storybook exposes MCP.
2. In `storyrail.config.json` → `designSystem`: set `package` (the npm package of the component library) and
   `storybookUrl`, then `enabled: true`. `figmaRequired: true` makes requirement analysis ask when a story has no Figma link.
3. In `.bob/rules/02-house-standards.md`, frontend part: name the package and your styling/token rules.
4. The frontend project installs the package from your internal registry (`.npmrc`, token as a CI variable).

**Backend: follow an existing application and your coding standards**

1. In `storyrail.config.json` → `references.backend`: set `repo`, `cloneUrl` and `branch`, then `enabled: true`.
   `node scripts/storyrail-workspace.mjs sync` clones it read-only into `references/backend` (git-ignored).
2. In `.bob/rules/02-house-standards.md`, backend part: replace the `TODO(office)` lines with your real standards.

## The dashboard: squad and chat

The dashboard opens on the **Orchestration** view: Naveen, the orchestrator, in the centre and the squad around him in
the order a story moves. Laurence (product owner) and Harri (QA tester) are shown **greyed**: they work outside
StoryRail, and the dashed hand-offs to them (CI green → CDD → QA testing → sprint review) show where the team takes over.
The spoke to whoever is working lights up, a waiting hand-off glows amber, and during a re-check Priya and Subramanian
get a "Round 2" tag. The line above the diagram says what each active member is doing, one line per member.

The **Squad** tab shows every member with a name and a role, with whoever is working shown large at the top. The
**Flow** tab has the rail diagram, including the steps after StoryRail. The **Evals** tab shows the squad's exams
(`evals/results/`): the verdict of the latest one against the one before, a scoreboard per practice story and the
history; while an exam runs, every tab shows an EVAL banner. The theme switch in the top-right corner sets
Auto, Light or Dark.

### Exams after a change

1. **Once:** fill in the practice stories (`node scripts/storyrail-eval.mjs validate` lists every `TODO(office)`). The
   easiest source is a story the squad already delivered: freeze the apps at the commit before it was merged, copy the
   story with the parts of its Screen and API documents, and turn its acceptance tests into hidden tests. Step by step:
   [evals/README.md](../../evals/README.md). Then `node scripts/storyrail-eval.mjs check E1`: on the frozen code most
   hidden tests must fail.
2. `/storyrail eval baseline` while the squad works well.
3. After that: IBM updated Bob → `/storyrail eval tool`; you changed a mode, a rule, the house standards, an MCP server
   or a setting → `/storyrail eval change <what you changed>`.

An exam is (practice stories × 3) story runs, so it takes a few hours: run it when something changed, not every day.
The hidden tests are listed in `.bobignore`, so Bob's file tools can't read them.

**Rename the squad** in `storyrail.config.json` → `squad.members` (name, role, a one-line "about"; `outOfScope` for a
person who works outside StoryRail). Restart the dashboard server to pick it up.

### Showing the demo anywhere (no network, no account)

`docs/demo/index.html` is a single, self-contained page that replays a sample run of story #1 (three applications) on a loop, with the
Orchestration, Squad and Flow tabs, chat from the members' records and the **Evals** tab with sample exams.
It needs no server, no login and no internet:

- **Double-click** `docs/demo/index.html`, or open http://localhost:4800/demo while the dashboard runs.
- **Share it** as a file (mail, Teams), or host the `docs/` folder on a static server (GitLab Pages, an intranet server).

After changing the dashboard, the squad names or the sample data in `storyrail-dashboard/demo-src/`, rebuild it with
`node scripts/storyrail-build-demo.mjs` and commit the result.

### Ask a squad member

Select a member to see their work as a timeline (status updates, reports they wrote) and ask them about it, e.g.
"Which acceptance criteria have you covered?" or "Why did you flag R1-01?" (to Priya). They answer in role, from their records.
Their records include the **work notes** every agent leaves in `runs/issue-<N>/notes/<station>.md` (decisions and why,
assumptions, files changed) and the **completion summary** the orchestrator saves in `runs/issue-<N>/summaries/`.
People outside StoryRail can't be asked here.

| `STORYRAIL_ASK` | Who answers | Needs |
|---|---|---|
| `auto` (default) | Bob if it is set up, else records | – |
| `bob` | IBM Bob Shell in **ask mode** (`bob run --mode ask`, read-only) | Bob Shell installed and `BOB_API_KEY` set (ask your Bob admin) |
| `records` | No AI: status, recent log, work notes and reports | – |

The terminal prints which one is used. Answers can read the run but never change files, and the chat API only accepts
requests from the dashboard page itself. Chats are kept per member in `.storyrail/chats/` (not committed).

## Good to know

- **Parallel stages.** Build, isolated tests and fixes run **one subagent per application, all at the same time**, and
  review ∥ scans side by side. Each app builds against its providers' contracts with the providers stubbed; each backend
  runs its tests on its own port (8081, 8082, …) with its stub on port + 100. Subagents don't get their mode's file limits, so
  `scripts/storyrail-lanes.mjs` checks every changed file afterwards: anything outside the agents' lanes fails the stage
  and goes back to that agent. If subagents aren't allowed in your Bob setup, the orchestrator runs them one after the other.
- **Any mix of apps.** One frontend, two backends, three backends: the dashboard draws one lane per app. A member with no
  app of their kind in the story shows as "not needed". Merging follows the dependencies, providers first.
- **Nothing reaches the default branch without your yes.** Branches may be pushed earlier (for CI-mode scans and the
  merge requests), but merging only happens after you approve it in the chat.
- **Your computer must stay awake** during a run (Fortify scans can take a while): `caffeinate -i` in another terminal.
- **The dashboard** is local only (`127.0.0.1:4800`); it reads `.storyrail/status.json`, which is not committed.
- **Corporate network.** npm, Maven and Playwright's browser download must reach your internal registry or proxy
  (e.g. `npm config set registry …`, Maven `settings.xml` mirror, `PLAYWRIGHT_DOWNLOAD_HOST`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/storyrail` not in the `/` list | Open the repo root as the folder in Bob; check `.bob/commands/storyrail.md` exists (`git switch bob`). |
| StoryRail modes missing | Settings → Modes → *Edit Project Modes*; fix the YAML error it shows, then reload the window. |
| `storyrail-gitlab: no token` | Set `GITLAB_TOKEN` (or the variable in `gitlab.tokenEnv`) in `~/.zprofile`, open a new terminal, restart Bob. |
| `HTTP 401` / `HTTP 403` from GitLab | The token expired or lacks the `api` scope, or you have no access to that project. |
| `fetch failed` / certificate errors | Set `NODE_EXTRA_CA_CERTS` to your company's CA file (see "GitLab token"). |
| An attachment "could not download" | Open the issue in GitLab, save the document into `runs/issue-<N>/docs/` and say "continue". |
| "Edit not allowed" in a mode | Working as intended: that file is outside the mode's lane. The orchestrator sends it to the right mode. |
| A scanner shows "not run" | Its command is still `TODO(office)`, the tool isn't installed, or its token is missing. Fix it or set its mode to `ci`/`off`. |
| Backend steps say "Maven missing" | Install Java 21 and Maven 3.9, then open a new terminal. |
| Playwright "browser not installed" | `npx playwright install chromium` |
| "no project found" / "several projects match" for an app | Check the name in the story's Applications section and `gitlab.group`, or add the app to `apps.map`. |
| An app "has uncommitted changes" | Discovery won't overwrite work: commit or discard the changes in `projects/<type>/<app>` first. |
| Dashboard shows "dashboard server stopped" | `node scripts/storyrail-dashboard.mjs` in a separate terminal. |
| A stage fails twice | The orchestrator stops and tells you why. Fix or answer, then say "continue". |
