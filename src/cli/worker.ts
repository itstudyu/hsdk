// `hsdk worker list` — shows installed workers
import { resolveHarnessPaths } from '../io/paths.js';
import { listWorkers, readWorker } from '../io/worker-file.js';
import { join } from 'node:path';
import pc from 'picocolors';

export async function runWorkerCommand(projectRoot: string, sub: string): Promise<void> {
  const paths = resolveHarnessPaths(projectRoot);
  if (sub === 'list') {
    const names = await listWorkers(paths.workersDir);
    if (names.length === 0) {
      process.stdout.write('No workers installed. Run hsdk init.\n');
      return;
    }
    for (const n of names) {
      const w = await readWorker(join(paths.workersDir, `${n}.md`));
      process.stdout.write(`${pc.bold(w.frontmatter.name)} (${w.frontmatter.type}) — ${w.frontmatter.description}\n`);
    }
    return;
  }
  throw new Error(`unknown worker subcommand: ${sub}`);
}
