// `hsdk run <ticket-id>` — dispatches workers after approval gate check
import { dispatch } from '../dispatcher/run.js';
import pc from 'picocolors';

export async function runRunCommand(projectRoot: string, ticketId: string): Promise<void> {
  process.stdout.write(pc.bold(`\nhsdk run — ${ticketId}\n`));
  await dispatch({ projectRoot, ticketId });
  process.stdout.write(pc.green('\n✓ all workers complete\n'));
}
