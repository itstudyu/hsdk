// `hsdk plan <request>` — runs planner grilling then approval loop
import { join } from 'node:path';
import { runPlanner } from '../planner/run.js';
import { runApprovalLoop } from '../planner/approval.js';
import pc from 'picocolors';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'ticket';
}

function todayId(request: string): string {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${date}-${slugify(request)}`;
}

export async function runPlanCommand(projectRoot: string, request: string): Promise<void> {
  const ticketId = todayId(request);
  process.stdout.write(pc.bold(`\nhsdk plan — ticket ${ticketId}\n\n`));
  const { ticketDir } = await runPlanner({ projectRoot, request, ticketId });
  const planMd = join(ticketDir, 'plan.md');
  process.stdout.write(pc.bold('\n--- Grilling complete. Approval gate ---\n'));
  const choice = await runApprovalLoop(planMd);
  process.stdout.write(`\nResult: ${choice}\n`);
  if (choice === 'approve') {
    process.stdout.write(pc.green(`\nReady to dispatch. Run: hsdk run ${ticketId}\n`));
  }
}
