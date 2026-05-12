// runs the planner sub-agent for a user request, producing a plan.md draft
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import matter from 'gray-matter';
import { resolveHarnessPaths } from '../io/paths.js';
import { listWorkers, readWorker } from '../io/worker-file.js';
import { ensureTicketDir } from '../io/ticket.js';
import { writePlanFile } from '../io/plan-file.js';
import { buildPlannerSystemPrompt } from './system-prompt.js';
import { PlanFrontmatter, assertWorkflowDag } from '../schemas/plan.js';
import { PLAN_WORKER_MD, assertWithinHardCap } from '../io/lengths.js';

export interface RunPlannerOptions {
  projectRoot: string;
  request: string;
  userLanguage?: string;
  ticketId: string;
}

const PLAN_BLOCK_RE = /```plan\.md\s*\n([\s\S]*?)```/m;
const WORKER_PLAN_BLOCK_RE = /```plan\.([a-zA-Z0-9_-]+)\.md\s*\n([\s\S]*?)```/g;

export function extractPlanBlock(text: string): string | null {
  const m = text.match(PLAN_BLOCK_RE);
  return m ? m[1]!.trim() + '\n' : null;
}

export interface WorkerPlanBlock {
  worker: string;
  content: string;
}

export function extractWorkerPlanBlocks(text: string): WorkerPlanBlock[] {
  const blocks: WorkerPlanBlock[] = [];
  const re = new RegExp(WORKER_PLAN_BLOCK_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    blocks.push({ worker: m[1]!, content: m[2]!.trim() + '\n' });
  }
  return blocks;
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

  const workerBlocks = extractWorkerPlanBlocks(lastAssistantText);
  const referencedFiles = new Set(
    frontmatter.workflow.map((s) => s.plan).filter((p): p is string => !!p),
  );
  for (const block of workerBlocks) {
    const filename = `plan.${block.worker}.md`;
    if (!referencedFiles.has(filename)) {
      process.stdout.write(
        `\n[planner] warning: ${filename} block emitted but no workflow.plan references it — skipping\n`,
      );
      continue;
    }
    assertWithinHardCap(block.content, PLAN_WORKER_MD, {
      escapeReason: frontmatter.escape_reason,
      label: filename,
    });
    const target = join(ticketDir, filename);
    await writeFile(target, block.content, 'utf8');
    process.stdout.write(`[planner] ${filename} written: ${target}\n`);
  }

  for (const ref of referencedFiles) {
    const emitted = workerBlocks.some((b) => `plan.${b.worker}.md` === ref);
    if (!emitted) {
      throw new Error(
        `workflow references ${ref} but planner did not emit a matching fenced block`,
      );
    }
  }

  return { ticketDir };
}
