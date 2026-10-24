/* Demo: the work notes each agent leaves in runs/issue-1/notes/<station>.md (sample data for the replay).
   A member's notes show in the chat once their step has started. */
const DEMO_NOTES={
  "req-fetch":["Read #1 and its comments, and the two documents the functional analyst attached: the Screen document and the API document.",
    "The story's Applications section names three apps. Discovery found them in GitLab: INSU-ta01 (backend), INSU-fa01 (backend, calls INSU-ta01) and INSU-sp01 (frontend, calls INSU-fa01).",
    "9 testable ACs, 3 per app: ta01-AC1..3 (info endpoint, 404), fa01-AC1..3 (facade, error mapping), sp01-AC1..3 (screen, empty and error states).",
    "The API document didn't say what INSU-fa01 returns when INSU-ta01 has no info, so I asked. You answered 404 \"Task info not found\"; posted on #1.",
    "Contracts provider first: INSU-ta01's own contract, its copy in INSU-fa01, then INSU-fa01's contract and its copy in INSU-sp01."],
  "dev@INSU-ta01":["Added GET /tasks/{id}/info with a query on the existing TaskRepository; nothing new in the schema.",
    "No info for a task returns 404 with the problem title from the API document.",
    "18 tests, mvn verify green.",
    "Round 1 fix: Sonar flagged SQL built by string concatenation; switched to bound parameters."],
  "dev@INSU-fa01":["Built against INSU-ta01's contract, not its code: a TaskInfoClient generated from the contract copy, with a WireMock stub of INSU-ta01 for the tests.",
    "GET /info/{id} maps INSU-ta01's 404 to its own 404 problem, as you answered.",
    "22 tests, mvn verify green.",
    "Round 1 fix (R1-01): a timeout from INSU-ta01 now returns 503, as the API document says, with a regression test."],
  "dev@INSU-sp01":["Built the info screen from the Screen document against INSU-fa01's contract copy, with the API mocked.",
    "New test ids: task-info, task-info-empty. 26 tests, 96% lines.",
    "Round 1 fix: upgraded axios from 1.6.0 to 1.7.4 for the NexusIQ Severe violation."],
  "tests@INSU-ta01":["Ran INSU-ta01 on :8081 and 8 API scenarios for ta01-AC1..3. Each scenario cleans up after itself.",
    "Round 2: re-ran after the SQL fix: 8/8 green."],
  "tests@INSU-fa01":["Ran INSU-fa01 on :8082 with INSU-ta01 stubbed on :8182 from its contract: success, 404, 500 and a timeout.",
    "10 scenarios for fa01-AC1..3, every response checked against INSU-fa01's contract.",
    "Round 2: added the regression scenario for R1-01 (timeout → 503). 11/11 green."],
  "tests@INSU-sp01":["9 Playwright tests for sp01-AC1..3 with INSU-fa01 mocked, using the new test ids.",
    "Round 2: re-ran the whole suite after the axios upgrade: 9/9 green."],
  "gate":["Round 1, all local on the three apps: Sonar on all, Fortify on the two backends, NexusIQ on all.",
    "Sonar: one critical issue in INSU-ta01 (SQL concatenation). NexusIQ: axios 1.6.0 in INSU-sp01 is a Severe violation. Fortify: clean.",
    "Round 2: every gate passed on every app, 0 findings."],
  "reviewer":["Round 1: CHANGES_REQUESTED. One major in INSU-fa01: a timeout from INSU-ta01 came back as 500, the API document says 503 (R1-01). Two minors on naming.",
    "Checked each app uses its provider exactly as the contract says: field names, status codes, problem titles.",
    "Round 2: APPROVE. Every AC is implemented and has a test tagged with it."],
  "cicd":["Opened a merge request per app: INSU-ta01 !21, INSU-fa01 !34, INSU-sp01 !47. All MR pipelines went green.",
    "You approved the merge. Merged providers first: INSU-ta01, then INSU-fa01, then INSU-sp01, waiting for each main pipeline.",
    "All three pipelines green on main. Deployment with CDD is up to the team, in the same order."],
  "orchestrator":["Relayed one question from Sindhu to you and posted the answer on #1.",
    "Built all three apps at the same time, each against its provider's contract with the provider stubbed.",
    "Fix round 1 went to the three developers; tests re-ran, and round 2 passed every gate.",
    "Merged in dependency order after your OK; labelled #1 Ready for QA."]
};
function demoNotes(m){ const ids=m.kind==="lead"?["orchestrator"]:memberStations(m); const out=[];
  ids.forEach(id=>{ const st=(state[id]||{}).status; if(id==="orchestrator"?!!run.startedAt:(st&&st!=="pending"&&st!=="skipped")) (DEMO_NOTES[id]||[]).forEach(n=>out.push(n)); });
  return out; }
