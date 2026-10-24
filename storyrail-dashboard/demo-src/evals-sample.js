/* Demo: sample exams for the Evals tab, in the same shape as evals/results/*.json (the live dashboard reads those). */
(() => {
  const run = (k, passed, major, rounds, human, minutes) => ({ run: k, passed, major, rounds, human, minutes });
  const exam = (id, date, reason, label, detail, e1, e2) => ({ id, date, reason, label, detail, finishedAt: date,
    stories: { E1: { title: 'Loan history for a book', tests: 11, runs: e1.map((r, i) => run(i + 1, ...r)) },
               E2: { title: 'Sort the book list', tests: 11, runs: e2.map((r, i) => run(i + 1, ...r)) } } });
  window.__EVALS__ = {
    sample: true,
    config: {
      setup: { name: 'Claude Code + StoryRail agents', tool: 'Claude Code', toolAdvice: 'Pin the previous version until it is fixed, and keep this exam as evidence.' },
      runsPerStory: 3,
      targets: { hiddenPassPct: 90, spreadPts: 10, majorPerRun: 0.5, humanInterventions: 0 },
      compare: { dropPts: 2 },
      stories: [
        { id: 'E1', title: 'Loan history for a book', kind: 'Story', lanes: ['frontend', 'backend'], tests: 11, why: 'Frontend and backend together: a new endpoint, a contract change and a dialog with focus handling' },
        { id: 'E2', title: 'Sort the book list', kind: 'Story', lanes: ['backend'], tests: 11, why: 'Backend only: query validation, stable paging and keeping today\'s default order' },
      ],
    },
    exams: [
      exam('2026-10-21-0900', '2026-10-21T09:00:00Z', 'baseline', 'Baseline', 'First exam, before the demo',
        [[11, 0, 1, 0, 41], [10, 1, 1, 0, 44], [11, 0, 1, 0, 40]], [[11, 0, 1, 0, 22], [11, 0, 1, 0, 21], [10, 0, 1, 0, 24]]),
      exam('2026-11-04-0900', '2026-11-04T09:00:00Z', 'tool', 'Claude Code update', 'Claude Code updated to a new version',
        [[11, 0, 1, 0, 39], [11, 0, 1, 0, 41], [10, 0, 1, 0, 42]], [[11, 0, 1, 0, 21], [11, 0, 1, 0, 22], [11, 0, 1, 0, 21]]),
      exam('2026-11-18-0900', '2026-11-18T09:00:00Z', 'change', 'Brief change', 'Frontend developer brief: return focus after every dialog',
        [[11, 0, 1, 0, 38], [11, 0, 1, 0, 39], [11, 0, 1, 0, 37]], [[11, 0, 1, 0, 21], [11, 0, 1, 0, 20], [11, 0, 1, 0, 21]]),
      exam('2026-12-02-0900', '2026-12-02T09:00:00Z', 'tool', 'Claude Code update', 'Claude Code updated to a new version',
        [[9, 2, 2, 1, 52], [10, 1, 1, 0, 45], [8, 2, 2, 1, 56]], [[10, 1, 1, 0, 26], [11, 0, 1, 0, 23], [9, 1, 2, 0, 28]]),
    ],
  };
})();
