---
description: Run a GitLab user story or bug through StoryRail (story, `fix <bugs>`, `eval <reason>` or `status`)
argument-hint: "<issue> [more issues] | fix <bug-issue> [...] | eval <baseline|tool|change> [what changed] | status"
---

Switch to the **StoryRail · Orchestrator** mode (`sr-orchestrator`) and follow its brief in
`.bob/rules-sr-orchestrator/01-orchestrator.md` from the top.

Arguments: $1 $2 $3 $4 $5 $6

Ignore any argument that is still a literal `$` followed by a digit (it was not given). If no argument was given,
ask the user which issue number to run. Never pick an issue yourself.
