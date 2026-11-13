#!/usr/bin/env node
// Everything the old GitHub workflows ran, run locally before a release push (Q-72, D30).
//   node tools/publish/release-check.mjs [--export <dir>] [--skip-tests]
//   --export <dir>  also finish an allow-list export folder: copy the built guides/dist, write .nojekyll,
//                   remove any .github/, run check-precache inside it. The export is then the finished static site.
//   --strict        make the regression suite blocking (it is advisory by default: all 25 cases import the
//                   authoring-app modules, which moved to the authoring-app repo, so they cannot run here)
//   --skip-tests    skip the unit + regression suites (use only to re-run the export step quickly)
// Exit code is non-zero on the first failing step. Node 20, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const a = process.argv.slice(2);
let exportDir = null, skipTests = false, strict = false;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--export') exportDir = path.resolve(a[++i] || '');
  else if (a[i] === '--skip-tests') skipTests = true;
  else if (a[i] === '--strict') strict = true;
  else { console.error('Usage: release-check.mjs [--export <dir>] [--skip-tests] [--strict]'); process.exit(2); }
}

const results = [];
function step(name, cmd, args, cwd = ROOT, advisory = false) {
  process.stdout.write(`== ${name}\n`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  const ok = r.status === 0;
  results.push({ name, ok });
  if (!ok && advisory) { results[results.length - 1].ok = 'WARN'; console.warn(`WARN (advisory): ${name}`); return; }
  if (!ok) {
    console.error(`\nFAIL: ${name}`);
    summary();
    process.exit(1);
  }
}
function summary() {
  console.log('\n-- release-check summary');
  for (const r of results) console.log(`${r.ok === true ? 'PASS' : r.ok === 'WARN' ? 'WARN' : 'FAIL'}  ${r.name}`);
}

const node = process.execPath;
if (!skipTests) {
  step('unit tests', node, ['test/unit/run.js']);
  // Each regression case pins a defect that once reached real content.
  step('regression suite', node, ['test/regression/run.js'], ROOT, !strict);
}
// config/{constitutions,phase-prompts}.json are compiled from docs/authoring/; they must not drift.
step('authoring prompt config matches docs/authoring/', 'python3', ['tools/build-prompt-config.py', '--check']);
step('guides check', node, ['tools/guides/build-guides.mjs', '--check']);
step('staged-generation doc bundles up to date', node, ['content-repo-template/tools/staged-generation/build-bundles.mjs', '--check']);
step('kit simulation base classes match the engine', node, ['tools/sync-simulations-kit.mjs', '--check']);
step('build guides (guides/dist)', node, ['tools/guides/build-guides.mjs']);
step('service worker precache list', node, ['tools/check-precache.mjs']);

if (exportDir) {
  if (!fs.existsSync(path.join(exportDir, 'index.html'))) { console.error(`not an engine export (no index.html): ${exportDir}`); process.exit(2); }
  process.stdout.write(`== finish export ${exportDir}\n`);
  fs.rmSync(path.join(exportDir, 'guides/dist'), { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'guides/dist'), path.join(exportDir, 'guides/dist'), { recursive: true });
  fs.writeFileSync(path.join(exportDir, '.nojekyll'), '');
  fs.rmSync(path.join(exportDir, '.github'), { recursive: true, force: true });
  step('precache list inside the export', node, ['tools/check-precache.mjs'], exportDir);
}
summary();
console.log(exportDir ? '\nOK: export is the finished static site.' : '\nOK');
