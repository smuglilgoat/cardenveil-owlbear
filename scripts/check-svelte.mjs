/**
 * Build gate around svelte-check.
 *
 * Why a filter: this codebase is JS + JSDoc, so the full svelte-check baseline
 * is ~1500 *pre-existing* inference diagnostics (implicit any, properties on
 * `never`, "possibly null" DOM lookups…). Gating the build on all of them would
 * block every deploy, and fixing them is a separate, much bigger job — run
 * `npm run check:types` to see the whole list.
 *
 * What we DO gate on: diagnostics that mean the code references something that
 * does not exist — `Cannot find name/module/namespace`. Rollup cannot see those
 * (it treats unbound identifiers as globals), which is how
 * `Uncaught ReferenceError: logEvent is not defined` shipped in 2.7.11 and
 * silently broke the GM hand popover until the logs exposed it.
 *
 * Usage: `npm run check` (wired into `npm run build`).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SERIOUS = [/^Cannot find name/, /^Cannot find module/, /^Cannot find namespace/];
const LINE = /^\d+ (ERROR|WARNING) "([^"]+)" (\d+:\d+) "(.*)"$/;

let output = '';
try {
  output = execFileSync(
    process.execPath,
    [path.resolve('node_modules/svelte-check/bin/svelte-check'), '--tsconfig', './jsconfig.json', '--output', 'machine'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (err) {
  // svelte-check exits 1 as soon as the baseline has any diagnostic: parse the
  // report instead of relying on its status.
  output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  if (!output.includes('ERROR') && !output.includes('START')) {
    console.error('svelte-check could not run:');
    console.error(output || err.message);
    process.exit(1);
  }
}

const diagnostics = [];
for (const raw of output.split('\n')) {
  const match = LINE.exec(raw.trim());
  if (match) diagnostics.push({ level: match[1], file: match[2], where: match[3], message: match[4] });
}

const errors = diagnostics.filter((d) => d.level === 'ERROR');
const serious = errors.filter((d) => SERIOUS.some((re) => re.test(d.message)));

if (serious.length > 0) {
  console.error(`\n✖ ${serious.length} reference error(s) — code uses a name that does not exist:\n`);
  for (const d of serious) console.error(`  ${d.file}:${d.where}  ${d.message}`);
  console.error('\n(Fix the reference or add the missing import — Rollup does not catch this at build time.)\n');
  process.exit(1);
}

console.log(
  `✔ svelte-check: 0 reference errors (${errors.length} pre-existing type-inference diagnostics ignored — see npm run check:types)`
);
