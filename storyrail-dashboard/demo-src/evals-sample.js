/* Demo: sample exams for the Evals tab, in the same shape as evals/results/*.json (the live dashboard reads those). */
(() => {
  const run = (k, passed, major, rounds, human, minutes) => ({ run: k, passed, major, rounds, human, minutes });
  const exam = (id, date, reason, label, detail, e1, e2) => ({ id, date, reason, label, detail, finishedAt: date,
    stories: { E1: { title: 'A new task field through the facade', tests: 11, runs: e1.map((r, i) => run(i + 1, ...r)) },
               E2: { title: 'The task screen shows the new field', tests: 11, runs: e2.map((r, i) => run(i + 1, ...r)) } } });
  window.__EVALS__ = {
    sample: true,
    config: {
      setup: { name: 'IBM Bob + house standards + Figma MCP', tool: 'IBM Bob', toolAdvice: 'Raise it with IBM and attach this exam as evidence.' },
      runsPerStory: 3,
      targets: { hiddenPassPct: 90, spreadPts: 10, majorPerRun: 0.5, humanInterventions: 0 },
      compare: { dropPts: 2 },
      stories: [
        { id: 'E1', title: 'A new task field through the facade', kind: 'Story', lanes: ['INSU-ta01', 'INSU-fa01'], tests: 11, why: 'Two backends that call each other: contract first, provider stubbed, error mapping' },
        { id: 'E2', title: 'The task screen shows the new field', kind: 'Story', lanes: ['INSU-sp01'], tests: 11, why: 'Frontend only: Screen document, Figma frame and Storybook components' },
      ],
    },
    exams: [
      exam('2026-10-21-0900', '2026-10-21T09:00:00Z', 'baseline', 'Baseline', 'First exam, before the demo',
        [[11, 0, 1, 0, 41], [10, 1, 1, 0, 44], [11, 0, 1, 0, 40]], [[11, 0, 1, 0, 22], [11, 0, 1, 0, 21], [10, 0, 1, 0, 24]]),
      exam('2026-11-04-0900', '2026-11-04T09:00:00Z', 'tool', 'Bob update', 'Bob updated by IBM (version 2.2)',
        [[11, 0, 1, 0, 39], [11, 0, 1, 0, 41], [10, 0, 1, 0, 42]], [[11, 0, 1, 0, 21], [11, 0, 1, 0, 22], [11, 0, 1, 0, 21]]),
      exam('2026-11-18-0900', '2026-11-18T09:00:00Z', 'change', 'Rules change', 'Frontend developer rules: check every Storybook prop before use',
        [[11, 0, 1, 0, 38], [11, 0, 1, 0, 39], [11, 0, 1, 0, 37]], [[11, 0, 1, 0, 21], [11, 0, 1, 0, 20], [11, 0, 1, 0, 21]]),
      exam('2026-12-02-0900', '2026-12-02T09:00:00Z', 'tool', 'Bob update', 'Bob updated by IBM (version 2.3)',
        [[9, 2, 2, 1, 52], [10, 1, 1, 0, 45], [8, 2, 2, 1, 56]], [[10, 1, 1, 0, 26], [11, 0, 1, 0, 23], [9, 1, 2, 0, 28]]),
    ],
  };
})();
