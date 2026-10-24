# Exams: is the squad still as good as before?

StoryRail's agents are only as good as the AI tool behind them and the briefs, rules and skills you give them. Both
change: the tool gets updated without asking, and you keep improving the briefs. **Evaluation-driven development (EDD)**
means you don't trust such a change until the squad has passed the same exam as before.

An exam is something you start yourself, `/storyrail eval <reason>` in the Bob chat. Real user stories keep running once, as usual.

## How an exam works

1. **Fixed practice stories** (`stories/`). Kept apart from the backlog and never merged. Each one is built from the same
   **frozen commits** of the projects every time (`freeze` in `evals.json`), so every exam asks exactly the same question.
2. **Hidden tests** (`hidden/`). The answer key of each practice story: black-box tests against the running backend and
   the screen, using only what the story itself states (endpoints, fields, accessible names and texts). The agents never
   see them: the orchestrator is told not to, and `.bobignore` blocks Bob's file tools from the folder (Bob's docs say
   it doesn't cover every shell command, so the rule in the briefs matters too).
3. **Several runs per story** (`runsPerStory`, default 3). The full squad builds every story from scratch each time.
   Same score three times = a consistent squad; very different scores = luck. Nothing is pushed, merged or deployed:
   exam branches (`eval/<exam>/…`) stay on your machine, and scans that would need a pushed branch (`mode: ci`) are skipped.
4. **Compare.** The first exam (the **baseline**) is checked against your `targets`. Every later exam is compared with the
   one before it, and the dashboard's **Evals** tab and `storyrail-eval.mjs report` say what to do:

| Exam reason | You changed | Score dropped | Otherwise |
|---|---|---|---|
| `tool` | nothing: IBM updated Bob | the update is the cause: raise it with IBM, with the exam as evidence | the update is safe |
| `change` | a mode, a rule, house standards, an MCP server or a setting (`--detail` says which) | roll the change back | keep it |
| `baseline` | the first exam, or new targets | below target: fix the setup first | it becomes the baseline |

A "drop" is `compare.dropPts` percentage points of hidden tests or more (default 2).

## What is measured per run

| Measure | Where it comes from |
|---|---|
| Hidden tests passed | the grader runs `hidden/` against the run's code |
| Major findings | blocker + major findings of the round-1 review and scan |
| Fix rounds | how many fix rounds the run needed |
| Human interventions | how often the run needed the user (in an exam nobody should be asked) |
| Minutes | from `prepare` to `grade` |

## Where results live

`results/<exam-id>.json`, one file per exam, committed to the hub. The history is the point: the next exam is compared with
the last one, and the Evals tab draws all of them. The run folders (`runs/issue-eval-<exam>-<story>-r<k>/`) keep the specs, notes
and reviews of every exam run, so a drop can be explained.

## Commands

```bash
node scripts/storyrail-eval.mjs validate      # evals.json and its files are complete
node scripts/storyrail-eval.mjs check E1      # calibrate: hidden tests against the frozen code should mostly FAIL
node scripts/storyrail-eval.mjs list          # every exam with its score and verdict
node scripts/storyrail-eval.mjs report        # verdict of the latest exam (exit 1 if worse)
```

The orchestrator runs `start`, `prepare`, `grade` and `finish` during `/storyrail eval` (see the top of
`scripts/storyrail-eval.mjs`). `prepare` finds and clones the story's applications the usual way (`storyrail-apps.mjs`),
then puts each one on its frozen commit.

## Adding a practice story

The easiest source is a story you already delivered:

1. **Freeze**: the commit of each application just before that story was merged (GitLab: the MR's target commit).
2. **Story**: copy the issue text and the Applications section to `stories/E<n>.md`, with the parts of the Screen and API
   documents it needs (an exam run has no issue to download them from), and the refinement answers under "Answers the
   squad already has", so an exam run never needs to ask anyone. Put the apps in `evals.json` → `apps` (`"INSU-ta01,INSU-fa01>INSU-ta01"`).
3. **Hidden tests**: the acceptance tests that came with that story, rewritten as black-box tests that use only what the
   story states. Put them under `hidden/E<n>/` and declare them in `evals.json` (`hidden`, `tests` = how many there are,
   `services` = how to start each backend on its own port, calling the others). `hidden/E1/` is an example to adapt.
4. Run `check E<n>`: on the frozen code most hidden tests must fail; a test that passes there doesn't test the story.
5. Start a new **baseline**: an exam with a different set of stories can't be compared with the old ones.

Never change the hidden tests or the targets to make an exam pass. If a hidden test is wrong, fix it and take a new baseline.
