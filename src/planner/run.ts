// runs the planner sub-agent for a user request, producing a plan.md draft
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import matter from 'gray-matter';
import { resolveHarnessPaths } from '../io/paths.js';
import { listWorkers, readWorker } from '../io/worker-file.js';
import { ensureTicketDir } from '../io/ticket.js';
import { writePlanFile } from '../io/plan-file.js';
import { buildPlannerSystemPrompt } from './system-prompt.js';
import { PlanFrontmatter, assertWorkflowDag } from '../schemas/plan.js';

export interface RunPlannerOptions {
  projectRoot: string;
  request: string;
  userLanguage?: string;
  ticketId: string;
}

const PLAN_BLOCK_RE = /```plan\.md\s*\n([\s\S]*?)```/m;

export function extractPlanBlock(text: string): string | null {
  const m = text.match(PLAN_BLOCK_RE);
  return m ? m[1]!.trim() + '\n' : null;
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
  const planMd = join(ticketDir, 'plan.md');

  const result = query({
    prompt: `# ユーザー要求\n${opts.request}\n\nticket id: ${opts.ticketId}\nticket dir: ${ticketDir}\n\nGrilling を開始してください。質問は AskUserQuestion で 1 問ずつ。`,
    options: {
      systemPrompt,
      allowedTools: ['Read', 'Glob', 'Grep', 'Bash', 'AskUserQuestion'],
      cwd: opts.projectRoot,
    },
  });

  let lastAssistantText = '';
  for await (const message of result) {
    if (message.type !== 'assistant') continue;
    let turnText = '';
    process.stdout.write('\n[planner] ');
    for (const block of message.message.content) {
      if (block.type === 'text') {
        process.stdout.write(block.text);
        turnText += block.text;
      }
    }
    process.stdout.write('\n');
    if (turnText.trim().length > 0) lastAssistantText = turnText;
  }

  const planContent = extractPlanBlock(lastAssistantText);
  if (!planContent) {
    throw new Error(
      'planner did not emit a ```plan.md``` fenced block in its final message. ' +
        'Grilling may have ended before consensus.',
    );
  }
  const parsed = matter(planContent);
  const frontmatter = PlanFrontmatter.parse(parsed.data);
  assertWorkflowDag(frontmatter.workflow);
  await writePlanFile(planMd, { frontmatter, body: parsed.content });
  process.stdout.write(`\n[planner] plan.md written: ${planMd}\n`);

  return { ticketDir };
}
