// public library entry — re-exports core types and runners + createHarness factory
export * from '../schemas/index.js';
export * from '../io/index.js';
export { runPlanner, extractPlanBlock, extractWorkerPlanBlocks } from '../planner/run.js';
export { runApprovalLoop } from '../planner/approval.js';
export { dispatch } from '../dispatcher/run.js';
export { assertApproved, ApprovalGateError } from '../dispatcher/gate.js';
export { scheduleBatches } from '../dispatcher/topo.js';
export { extractPlanSection } from '../dispatcher/extract-section.js';
export { buildWorkerPrompt } from '../dispatcher/worker-prompt.js';
export { buildPlannerSystemPrompt } from '../planner/system-prompt.js';

import { runPlanner, type RunPlannerOptions } from '../planner/run.js';
import { runApprovalLoop, type ApprovalChoice } from '../planner/approval.js';
import { dispatch, type DispatchOptions } from '../dispatcher/run.js';
import { resolveHarnessPaths, planMdPath, ticketDir, type HarnessPaths } from '../io/paths.js';
import { listActiveTickets } from '../io/ticket.js';
import { readPlanFile } from '../io/plan-file.js';

export interface HarnessOptions {
  projectRoot: string;
  userLanguage?: string;
}

export interface PlanInput {
  request: string;
  ticketId: string;
}

export interface RunInput {
  ticketId: string;
}

export interface Harness {
  paths: HarnessPaths;
  plan(input: PlanInput): Promise<{ ticketDir: string }>;
  approve(ticketId: string): Promise<ApprovalChoice>;
  run(input: RunInput): Promise<void>;
  status(): Promise<Array<{ id: string; status: string; approved: boolean; title: string }>>;
}

// Spec A3: library API `import { createHarness } from 'hsdk'`.
// Wraps planner/approval/dispatcher behind a single factory so callers don't
// have to wire individual modules together.
export function createHarness(options: HarnessOptions): Harness {
  const paths = resolveHarnessPaths(options.projectRoot);

  return {
    paths,
    async plan(input: PlanInput) {
      const opts: RunPlannerOptions = {
        projectRoot: options.projectRoot,
        request: input.request,
        ticketId: input.ticketId,
        ...(options.userLanguage !== undefined ? { userLanguage: options.userLanguage } : {}),
      };
      return runPlanner(opts);
    },
    async approve(ticketId: string) {
      const dir = ticketDir(paths, ticketId, 'active');
      return runApprovalLoop(planMdPath(dir));
    },
    async run(input: RunInput) {
      const dispatchOpts: DispatchOptions = {
        projectRoot: options.projectRoot,
        ticketId: input.ticketId,
      };
      return dispatch(dispatchOpts);
    },
    async status() {
      const ids = await listActiveTickets(options.projectRoot);
      const out: Array<{ id: string; status: string; approved: boolean; title: string }> = [];
      for (const id of ids) {
        const path = planMdPath(ticketDir(paths, id, 'active'));
        try {
          const plan = await readPlanFile(path);
          out.push({
            id,
            status: plan.frontmatter.status,
            approved: plan.frontmatter.approved_at !== null,
            title: plan.frontmatter.title,
          });
        } catch {
          out.push({ id, status: 'invalid', approved: false, title: '' });
        }
      }
      return out;
    },
  };
}
