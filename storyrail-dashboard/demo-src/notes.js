/* Demo: the work notes each agent leaves in runs/issue-2/notes/<station>.md (sample data for the replay).
   A member's notes show in the chat once their step has started. */
const DEMO_NOTES={
  "req-fetch":["The issue's Applications section names two apps: library-backend (its API tests live in library-api-tests) and library-frontend, which calls it.",
    "Split the story into 7 testable ACs: FE-AC1 to FE-AC3 (Reserve button, queue position, error state), BE-AC4 to BE-AC7 (reserve, cancel, 409 when already reserved, 404).",
    "Contract first: added POST and DELETE /api/books/{id}/reservations in library-backend, copied to the frontend and API-tests repos.",
    "Assumed a queue of at most 5 per book; the issue didn't say. Flagged it as an open question, the analyst confirmed."],
  "dev@library-frontend":["Built the Reserve button into BookRow with a useReservation hook, against the new contract with the API mocked, so I didn't wait for the backend.",
    "The queue position shows as \"You're number 2 in the queue\" (FE-AC2); an API error shows a retry button (FE-AC3).",
    "Kept both API modes working: the demo API answers reservations the same way as the contract.",
    "New test ids: reserve-button, queue-position. 26 tests, 97% lines."],
  "dev@library-backend":["Added a Reservation entity with a many-to-one to Book and a queue position per book.",
    "POST returns 201 with the position, 409 when you already reserved that book, 404 for an unknown book (BE-AC4 to BE-AC7).",
    "Used the injected Clock for reservation dates, so the tests are deterministic.",
    "33 tests, mvn verify green, JaCoCo 91%."],
  "tests@library-frontend":["10 new Playwright tests for FE-AC1 to FE-AC3 on the mocked API, using the test ids from Varunesh.",
    "Covered the full queue, the error state and keyboard focus after reserving.",
    "Added axe and 360 px checks for the new button. 83 UI tests green in total."],
  "tests@library-backend":["14 new Cucumber scenarios in library-api-tests for BE-AC4 to BE-AC7, run against library-backend on my machine.",
    "Tagged 5 of them @qa: one happy path per AC plus the 404, safe on QA because each scenario cleans up.",
    "Every response is checked against the contract. 132 scenarios green."],
  "gate":["Round 1: ran lint, Semgrep, gitleaks, npm audit, osv-scanner and the Maven checks on all 3 repos.",
    "Two minor findings: a magic number for the queue size (S1-01) and a duplicated date format (S1-02).",
    "Round 2: all six tools clean, 0 findings."],
  "reviewer":["Round 1: CHANGES_REQUESTED. One major in library-frontend: the queue position isn't announced to screen readers (R1-01). Three minors.",
    "Checked the frontend calls library-backend exactly as the contract says.",
    "Round 2: APPROVE. Every AC is implemented and has a test tagged with it."],
  "fixer":["Fixed all 6 findings in one pass across both apps: R1-01 with a live region, plus the minors.",
    "Added 3 regression tests, one of them proves R1-01 fails on the old code.",
    "Disputed nothing."],
  "manual-tests":["Tested on the QA site, not a local build: 15 cases across desktop, 360 px, dark mode and keyboard only.",
    "No blocker or major. One low: the queue position wraps awkwardly at 360 px (D01), logged in the backlog.",
    "Checked the backend ACs against the QA API with curl as well."],
  "orchestrator":["Built both apps at the same time: the frontend against library-backend's new contract, with the API mocked.",
    "Review needed 2 rounds: round 1 found 1 major and 5 minors, round 2 approved.",
    "Merged in dependency order after Laurence approved: library-backend, library-api-tests, library-frontend."]
};
function demoNotes(m){ const ids=m.kind==="lead"?["orchestrator"]:memberStations(m); const out=[];
  ids.forEach(id=>{ const st=(state[id]||{}).status; if(id==="orchestrator"?!!run.startedAt:(st&&st!=="pending"&&st!=="skipped")) (DEMO_NOTES[id]||[]).forEach(n=>out.push(n)); });
  return out; }
