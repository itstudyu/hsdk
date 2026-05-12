// runs the planner sub-agent for a user request, producing a plan.md draft
import { mkdir } from 'node:fs/promises';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { resolveHarnessPaths } from '../io/paths.js';
import { listWorkers, readWorker } from '../io/worker-file.js';
import { ensureTicketDir } from '../io/ticket.js';
import { buildPlannerSystemPrompt } from './system-prompt.js';

export interface RunPlannerOptions {
  projectRoot: string;
  request: string;
  userLanguage?: string;
  ticketId: string;
}

export async function runPlanner(opts: RunPlannerOptions): Promise<{ ticketDir: string }> {
  const paths = resolveHarnessPaths(opts.projectRoot);
  await mkdir(paths.workersDir, { recursive: true });
  const workerNames = await listWorkers(paths.workersDir);
  const workers = await Promise.all(workerNames.map((n) => readWorker(`${paths.workersDir}/${n}.md`)));
  const now = new Date();

  const systemPrompt = buildPlannerSystemPrompt({
    userLanguage: opts.userLanguage ?? 'auto',
    date: now.toISOString(),
    availableWorkers: workers,
    todayIso: now.toISOString(),
  });

  const ticketDir = await ensureTicketDir(paths, opts.ticketId);

  const result = query({
    prompt: `# ユーザー要求\n${opts.request}\n\nticket id: ${opts.ticketId}\nticket dir: ${ticketDir}\n\nGrilling を開始してください。質問は AskUserQuestion で 1 問ずつ。`,
    options: {
      systemPrompt,
      allowedTools: ['Read', 'Glob', 'Grep', 'Bash', 'AskUserQuestion', 'Write', 'Edit'],
      cwd: opts.projectRoot,
    },
  });

  for await (const message of result) {
    if (message.type === 'assistant') {
      process.stdout.write('\n[planner] ');
      for (const block of message.message.content) {
        if (block.type === 'text') process.stdout.write(block.text);
      }
      process.stdout.write('\n');
    }
  }

  return { ticketDir };
}
