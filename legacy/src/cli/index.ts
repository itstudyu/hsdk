// hsdk CLI entry — commander dispatch over {init, plan, run, worker, status}
import { Command } from 'commander';
import { runInit } from './init.js';
import { runPlanCommand } from './plan.js';
import { runRunCommand } from './run.js';
import { runWorkerCommand } from './worker.js';
import { runStatusCommand } from './status.js';

const program = new Command();
program.name('hsdk').description('Harness SDK on Claude Agent SDK').version('0.1.0');

program
  .command('init')
  .description('bootstrap .harness/ in the current project')
  .action(async () => {
    await runInit(process.cwd());
  });

program
  .command('plan <request...>')
  .description('start grilling session for a new ticket')
  .action(async (parts: string[]) => {
    await runPlanCommand(process.cwd(), parts.join(' '));
  });

program
  .command('run <ticket-id>')
  .description('dispatch workers for an approved ticket')
  .action(async (ticketId: string) => {
    await runRunCommand(process.cwd(), ticketId);
  });

program
  .command('worker <sub>')
  .description('worker subcommands (list)')
  .action(async (sub: string) => {
    await runWorkerCommand(process.cwd(), sub);
  });

program
  .command('status')
  .description('show active tickets with approval state')
  .action(async () => {
    await runStatusCommand(process.cwd());
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`hsdk: ${(err as Error).message}\n`);
  process.exit(1);
});
