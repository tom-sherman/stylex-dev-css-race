// Loads the page against a cold Vite dev server, clicks the button, and reports
// whether the StyleX CSS was applied by the time the imported module evaluated.
//
// Every run gets a fresh Node process: @stylexjs/unplugin keeps its collected
// rules on `globalThis`, so a second server in the same process starts out
// already knowing the module's rules and never shows the race.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.argv[2] === '--once') {
  const { chromium } = await import('playwright');
  const { createServer } = await import('vite');

  const server = await createServer({ logLevel: 'silent', server: { port: 0 } });
  await server.listen();
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Let the page settle first, so the StyleX runtime's initial fetch is done.
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.click('#load');
  const result = await page.waitForFunction(() => window.__result).then((h) => h.jsonValue());

  await browser.close();
  await server.close();
  console.log(JSON.stringify(result));
  process.exit(0);
}

const RUNS = Number(process.argv[2] ?? 10);
let failures = 0;

for (let run = 1; run <= RUNS; run++) {
  const output = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--once'], {
    encoding: 'utf8',
  });
  const { atEvaluation, lateBy } = JSON.parse(output.trim().split('\n').at(-1));
  const ok = atEvaluation === '16px';
  if (!ok) failures++;
  console.log(
    `run ${String(run).padStart(2)}: padding-top when the module evaluated: ${atEvaluation.padEnd(4)} ${ok ? 'ok' : 'FAIL'}` +
      (ok ? '' : `  (styles applied ${lateBy.toFixed(0)}ms after the import started)`)
  );
}

console.log(`\n${failures}/${RUNS} runs had no StyleX CSS when the module evaluated`);
process.exit(failures > 0 ? 1 : 0);
