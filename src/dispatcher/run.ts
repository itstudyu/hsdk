// top-level dispatcher: gate → schedule batches → execute → append results.md → mv done
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertApproved } from './gate.js';
import { scheduleBatches } from './topo.js';
import { buildWorkerPrompt } from './worker-prompt.js';
import { extractPlanSection } from './extract-section.js';
import { runWorker } from './run-worker.js';
import { readPlanFile, setStatus } from '../io/plan-file.js';
import { findWorker } from '../io/worker-file.js';
import { readRefs } from '../io/refs-file.js';
import { resolveHarnessPaths, ticketDir, planMdPath, resultsMdPath } from '../io/paths.js';
import { moveTicketToDone } from '../io/ticket.js';
import { appendResult } from '../io/results.js';
import type { WorkflowStep } from '../schemas/plan.js';

export interface DispatchOptions {
  projectRoot: string;
  ticketId: string;
}

interface StepResult {
  step: WorkflowStep;
  output: string;
  hasDodVerification: boolean;
}

async function dispatchOne(opts: DispatchOptions, step: WorkflowStep): Promise<StepResult> {
  const paths = resolveHarnessPaths(opts.projectRoot);
  const tDir = ticketDir(paths, opts.ticketId, 'active');
  const plan = await readPlanFile(planMdPath(tDir));
  const worker = await findWorker(paths.workersDir, step.worker);
  const refs = await readRefs(paths.refsYaml);

  const workerPlanPath = step.plan ? join(tDir, step.plan) : undefined;
  const planSection = await extractPlanSection(
    plan.body,
    workerPlanPath,
    step.step,
    plan.frontmatter.escape_reason,
  );

  const systemPrompt = await buildWorkerPrompt({
    projectRoot: opts.projectRoot,
    worker,
    planSection,
    refs,
  });

  const result = await runWorker({
    projectRoot: opts.projectRoot,
    worker,
    systemPrompt,
    userPrompt: `step ${step.step}: ${step.worker} を実行してください。Output Format に従って結果を返してください。`,
  });

  return { step, output: result.output, hasDodVerification: result.hasDodVerification };
}

export async function dispatch(opts: DispatchOptions): Promise<void> {
  const paths = resolveHarnessPaths(opts.projectRoot);
  const tDir = ticketDir(paths, opts.ticketId, 'active');
  const pmd = planMdPath(tDir);
  await assertApproved(pmd);
  await setStatus(pmd, 'wip');

  try {
    const plan = await readPlanFile(pmd);
    const batches = scheduleBatches(plan.frontmatter.workflow);
    for (const batch of batches) {
      const stepResults = await Promise.all(batch.map((step) => dispatchOne(opts, step)));
      stepResults.sort((a, b) => a.step.step - b.step.step);
      for (const r of stepResults) {
        if (!r.hasDodVerification) {
          throw new Error(
            `worker "${r.step.worker}" (step ${r.step.step}) output missing "## DoD verification" section`,
          );
        }
        await appendResult(resultsMdPath(tDir), r.step.worker, r.output);
      }
    }
    await setStatus(pmd, 'done');
    await moveTicketToDone(paths, opts.ticketId);
  } catch (err) {
    await setStatus(pmd, 'blocked');
    throw err;
  }
}

export { readFile };
