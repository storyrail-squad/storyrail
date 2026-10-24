/* StoryRail exams (evaluation-driven development): the numbers and the verdict.
   One file for both sides: the dashboard loads it as a script, scripts/storyrail-eval.mjs requires it,
   so the page and the terminal always say the same thing.

   An exam result (evals/results/<id>.json):
   { id, date, reason: "baseline" | "tool" | "change", label, detail,
     stories: { E1: { title, tests, runs: [ { run, passed, major, rounds, human, minutes } ] } } }
*/
(function (root) {
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  /** Totals over every run of every story in one exam. */
  function stats(exam) {
    let passed = 0, total = 0;
    const spreads = [], major = [], rounds = [], human = [], mins = [];
    Object.values(exam.stories || {}).forEach((st) => {
      const runs = st.runs || [];
      if (!runs.length) return;
      runs.forEach((r) => { passed += r.passed; total += st.tests; major.push(r.major); rounds.push(r.rounds); human.push(r.human); mins.push(r.minutes); });
      const p = runs.map((r) => (r.passed / st.tests) * 100);
      spreads.push(Math.max(...p) - Math.min(...p));
    });
    return { pct: total ? (passed / total) * 100 : 0, passed, total, spread: avg(spreads), major: avg(major), rounds: avg(rounds),
      human: human.reduce((a, b) => a + b, 0), mins: avg(mins), runs: major.length };
  }

  /** [class, icon, headline, detail]: class is keep | worse | same. `cfg` = evals.json (targets, setup, compare). */
  function verdict(A, B, cfg) {
    const a = stats(A), T = cfg.targets, drop = (cfg.compare && cfg.compare.dropPts) || 2;
    const tool = (cfg.setup && cfg.setup.tool) || 'the AI tool';
    if (!B) {
      const ok = a.pct >= T.hiddenPassPct && a.spread <= T.spreadPts && a.major <= T.majorPerRun && a.human <= T.humanInterventions;
      const facts = 'Hidden tests ' + a.pct.toFixed(0) + '% (target ≥ ' + T.hiddenPassPct + '%) · spread between runs ' + a.spread.toFixed(0) +
        ' pts (≤ ' + T.spreadPts + ') · major findings ' + a.major.toFixed(1) + ' per run (≤ ' + T.majorPerRun + ') · human interventions ' +
        a.human + ' (target ' + T.humanInterventions + ').';
      return ok ? ['keep', '✓', 'First exam: it meets your targets and becomes the baseline.', 'There is nothing earlier to compare with, so it is checked against the targets you set. ' + facts]
                : ['worse', '!', 'First exam: below your targets. Fix the setup before you rely on it.', facts];
    }
    if (A.id === B.id) return ['same', '=', 'Pick two different exams to compare.', ''];
    const b = stats(B), d = a.pct - b.pct, steadier = a.spread <= b.spread + 2;
    const facts = 'Hidden tests ' + b.pct.toFixed(0) + '% → ' + a.pct.toFixed(0) + '% · spread between runs ' + b.spread.toFixed(0) + ' → ' +
      a.spread.toFixed(0) + ' points · major findings ' + b.major.toFixed(1) + ' → ' + a.major.toFixed(1) + ' per run · human interventions ' + b.human + ' → ' + a.human + '.';
    if (A.reason === 'tool') {
      if (d <= -drop) return ['worse', '!', 'Score dropped after the ' + tool + ' update. Your setup didn\'t change, so the update is the cause.', ((cfg.setup && cfg.setup.toolAdvice) || 'Keep this exam as evidence.') + ' ' + facts];
      return ['keep', '✓', 'The ' + tool + ' update is safe: same quality as before.', facts];
    }
    if (d <= -drop) return ['worse', '!', 'Roll the change back: the squad got worse.', facts];
    if (d >= drop || (d > -drop && steadier && a.major <= b.major)) return ['keep', '✓', 'Keep the change: the squad is as good or better.', facts];
    return ['same', '=', 'No clear difference.', facts];
  }

  /** The exam an exam is compared with: the one just before it (null for the first). */
  function previous(exams, exam) {
    const sorted = exams.slice().sort((x, y) => String(x.id).localeCompare(String(y.id)));
    const i = sorted.findIndex((e) => e.id === exam.id);
    return i > 0 ? sorted[i - 1] : null;
  }

  const api = { stats, verdict, previous, avg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StoryRailEvals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
