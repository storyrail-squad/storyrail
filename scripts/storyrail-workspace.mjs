#!/usr/bin/env node
// StoryRail workspace: prints the config, and keeps the applications of the latest run up to date.
// The applications themselves are not configured: each story names them, and `storyrail-apps.mjs discover <N>`
// finds and clones them into projects/<frontend|backend>/<app> (API-tests repos into projects/api-tests/<repo>).
//
// Usage:
//   node scripts/storyrail-workspace.mjs config    print the config (backlog repo, GitHub org, app types, squad)
//   node scripts/storyrail-workspace.mjs sync      put every repo of the latest run back on an up-to-date default branch
//   node scripts/storyrail-workspace.mjs status    branch, clean/dirty and last commit of every repo of the latest run

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, config, fail, latestApps } from './lib/storyrail.mjs';

const [cmd] = process.argv.slice(2);
switch (cmd) {
  case 'config':
    console.log(JSON.stringify(config, null, 2));
    break;
  case 'sync':
  case 'status': {
    const data = latestApps();
    if (!data) {
      console.log('No run has applications yet: `node scripts/storyrail-apps.mjs discover <N>` finds and clones them.');
      break;
    }
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'storyrail-apps.mjs'), cmd, String(data.issue)], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
    break;
  }
  default:
    fail('storyrail-workspace', 'commands: config, sync, status');
}
