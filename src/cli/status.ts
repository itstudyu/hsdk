// `hsdk status` — lists active tickets with status + approval state
import { resolveHarnessPaths, ticketDir, planMdPath } from '../io/paths.js';
import { listActiveTickets } from '../io/ticket.js';
import { readPlanFile } from '../io/plan-file.js';
import pc from 'picocolors';

export async function runStatusCommand(projectRoot: string): Promise<void> {
  const paths = resolveHarnessPaths(projectRoot);
  const ids = await listActiveTickets(projectRoot);
  if (ids.length === 0) {
    process.stdout.write('No active tickets.\n');
    return;
  }
  for (const id of ids) {
    const path = planMdPath(ticketDir(paths, id, 'active'));
    try {
      const plan = await readPlanFile(path);
      const approved = plan.frontmatter.approved_at ? pc.green('approved') : pc.yellow('pending');
      process.stdout.write(`${pc.bold(id)} [${plan.frontmatter.status}] ${approved} — ${plan.frontmatter.title}\n`);
    } catch (err) {
      process.stdout.write(`${pc.bold(id)} ${pc.red('invalid plan.md')} — ${(err as Error).message}\n`);
    }
  }
}
