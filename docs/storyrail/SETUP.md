# Run StoryRail on your laptop (macOS)

StoryRail runs inside **Claude Code** on your machine, using your Claude Pro/Max subscription. No API key is needed.
You start each run yourself with `/storyrail <issue number>`.

## 1. One-time setup

### Tools

```bash
# Homebrew (skip if you have it): https://brew.sh
brew install git gh node@22 maven
brew install --cask temurin@21              # Java 21 (asks for your Mac password: it runs an installer)
brew install semgrep gitleaks osv-scanner   # optional: used by the local quality scan if present

# node@22 and Java 21 are not on your PATH by default; add them once:
echo 'export PATH="$(brew --prefix node@22)/bin:$PATH"' >> ~/.zprofile
echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 21)' >> ~/.zprofile
source ~/.zprofile
```

Check: `node -v` shows 22.x, `java -version` shows 21, and `mvn -v` shows Maven 3.9+ **with Java version 21**, plus `gh --version`.

### Git identity (once per Mac)

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### Claude Code

```bash
curl -fsSL https://claude.ai/install.sh | bash     # Anthropic's native installer (auto-updates)
claude --version
```

Make sure `ANTHROPIC_API_KEY` is **not** set in your shell (`echo $ANTHROPIC_API_KEY` prints nothing). If it is set,
Claude Code bills that key instead of using your subscription.

### GitHub CLI login

```bash
gh auth login        # GitHub.com → HTTPS → log in with a browser
```

### The repos

Clone only the hub; it clones the two projects into `projects/` itself.

```bash
git clone https://github.com/storyrail-squad/storyrail.git
cd storyrail
node scripts/storyrail-workspace.mjs sync      # clones library-frontend, library-backend and library-api-tests into projects/
(cd projects/frontend && npm ci) && (cd projects/frontend/tests/ui && npm ci && npx playwright install chromium)
(cd projects/api-tests && mvn -B -q test-compile)   # downloads the Cucumber/RestAssured dependencies once
```

The repo names and QA URL live in `storyrail.config.json`. To use other repos (a fork, or your GitLab projects at the
office), change them there.

### First start

```bash
claude
```

Log in with your Claude account when the browser opens, and trust the folder when asked. Claude Code reads
`CLAUDE.md`, the agents in `.claude/agents/` and the `/storyrail` command automatically.

## 2. Each story

1. **Your analyst writes the story** as an issue in the backlog repo ([squad-backlog](https://github.com/storyrail-squad/squad-backlog)) with the *User story* template: the story, numbered acceptance criteria, and tick **Frontend** and/or **Backend**. StoryRail never writes or changes requirements.
2. When you decide that issue should be built, start Claude Code in the `storyrail` folder (`claude`) and give it the issue number:

   ```
   /storyrail 46
   ```

   Several issues that belong together: `/storyrail 46 47`.
3. Open the dashboard it prints: **http://localhost:4800**. Keep it on a second screen during a demo.
4. Answer when it stops at a gate:
   - questions about unclear acceptance criteria,
   - **"PRs are green: backend #X, API tests #Z, frontend #Y. Merge and deploy to QA?"** (one PR per repo the story touches; backend first, then API tests, then frontend),
   - which QA defects to fix now,
   - **sign-off**.
5. Bugs found later: the analyst uses the **Bug** template (steps, expected, actual), then `/storyrail fix 50 51`. This also starts at requirement fetch, which reads the bug issues.
6. Where is a run? `/storyrail status`.

Everything a run produces (spec, review and scan reports, QA log and screenshots) is committed in the hub under `runs/issue-<N>/`. The code goes to the project repos.

## The dashboard: squad and chat

The dashboard opens on the **Orchestration** view: Naveen, the orchestrator, in the centre and the squad around him in
the order a story moves, with Laurence (product owner) at the top. The spoke to whoever is working lights up, a waiting
hand-off glows amber, and when Naveen sends Sandrine's fixes back for a re-check, Priya and Subramanian get a
"Round 2" tag. The line above the diagram says what each active member is doing, one line per member.

The **Squad** tab shows every agent as a squad member with a name and a role (Sindhu the functional analyst, Varunesh and
Meysam the developers, Priya the strict reviewer, Charlotte the release engineer, …), with whoever is working shown large
at the top. The **Flow** tab has the rail diagram. The **Evals** tab shows the squad's exams (`evals/results/`): the verdict
of the latest one against the one before, a scoreboard per practice story and the history. While an exam runs, every tab
shows an EVAL banner.

### Exams after a change

Run `/storyrail eval baseline` once, while the squad works well. After that:

- Claude Code (or the model) was updated → `/storyrail eval tool`
- You changed a brief, a rule, a skill or a setting → `/storyrail eval change <what you changed>`

An exam is 2 practice stories × 3 runs of stages 1–5, so it takes a few hours and a good part of your plan's limit: run
it when something changed, not every day. It needs the backend to start locally (Java 21, Maven) and the frontend's UI
automation (Playwright), like a normal run. How it works and how to add practice stories: [evals/README.md](../../evals/README.md).

The theme switch in the top-right corner (screen, sun and moon icons for Auto, Light and Dark) sets the colour theme. Auto follows your system setting; Light or Dark
overrides it and is remembered in that browser.

**Rename the squad** in `storyrail.config.json` → `squad.members` (name, role, a one-line "about"). Restart the
dashboard server to pick it up.

### Showing the demo anywhere (no network, no account)

`docs/demo/index.html` is a single, self-contained page that replays a sample run of story #51 on a loop, with the
Orchestration, Squad and Flow tabs, chat from the members' records and an **Evals** tab with sample exam data.
It needs no server, no login and no internet:

- **Double-click** `docs/demo/index.html`, or open http://localhost:4800/demo while the dashboard runs.
- **Share it** as a file (mail, Teams), or host the `docs/` folder on any static server: GitLab Pages, an intranet
  web server, or GitHub Pages (Settings → Pages → Deploy from a branch → `/docs`; the page is then at `…/demo/`).

After changing the dashboard, the squad names or the sample data in `storyrail-dashboard/demo-src/`, rebuild it with
`node scripts/storyrail-build-demo.mjs` and commit the result.

### Ask a squad member

Select a member to see their work as a timeline (status updates, reports they wrote) and ask them about it, e.g.
"Which acceptance criteria have you covered?" or "Why did you flag R1-03?" (to Priya). They answer in role, from their records.
Their records include the **work notes** every agent leaves in `runs/issue-<N>/notes/<station>.md` (decisions and why,
assumptions, files changed) and the **completion summary** the orchestrator saves in `runs/issue-<N>/summaries/`.
Agents that ran side by side only hand a summary back to the orchestrator, so these files are what lets Varunesh or
Meysam explain afterwards why they built something the way they did.

| `STORYRAIL_ASK` | Who answers | Needs |
|---|---|---|
| `auto` (default) | Claude Code if it is installed, else records | – |
| `claude` | Claude Code in print mode, read-only tools | `claude` installed and logged in |
| `records` | No AI: status, recent log and reports | – |

```bash
node scripts/storyrail-dashboard.mjs                       # auto
STORYRAIL_ASK=records node scripts/storyrail-dashboard.mjs # never call an AI
```

The terminal prints which one is used. Answers can read the run but never change files, and the chat API only accepts
requests from the dashboard page itself. Chats are kept per member in `.storyrail/chats/` (not committed).

## Good to know

- **Usage limits.** A full story runs about ten agents and uses a lot of your plan's limit; on Pro a run may pause
  until the limit resets. Small, focused stories go much further than big ones.
- **Permissions.** `.claude/settings.json` pre-approves the routine commands (tests, lint, status updates).
  Claude Code still asks before anything else, such as pushing or merging.
- **Your computer must stay awake** during a run (System Settings → Battery/Lock Screen, or run `caffeinate -i` in another terminal).
- **The dashboard** is local only (`127.0.0.1:4800`); it reads `.storyrail/status.json`, which is not committed.
- **Chat cost.** Each question is one short AI call (a few seconds). Use `STORYRAIL_ASK=records` if you don't want any.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/storyrail` not found | Start `claude` from the repo root, not a subfolder. |
| `gh: not logged in` | `gh auth login` |
| Backend steps say "Maven missing" | `brew install maven` and `brew install --cask temurin@21`, then open a new terminal. |
| Playwright "browser not installed" | `(cd projects/frontend/tests/ui && npx playwright install chromium)` |
| `projects/frontend` missing, or "has uncommitted changes" | `node scripts/storyrail-workspace.mjs sync`; for uncommitted changes, commit or discard them in that project first. |
| Dashboard shows "dashboard server stopped" | `node scripts/storyrail-dashboard.mjs` in a separate terminal. |
| A stage fails twice | The orchestrator stops and tells you why. Fix or answer, then say "continue". |
