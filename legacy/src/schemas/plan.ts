// plan.md frontmatter zod schema with workflow DAG validation
import { z } from 'zod';

export const PlanStatus = z.enum(['draft', 'ready', 'wip', 'done', 'blocked']);
export type PlanStatus = z.infer<typeof PlanStatus>;

export const WorkflowStep = z.object({
  step: z.number().int().positive(),
  worker: z.string().min(1),
  plan: z.string().optional(),
  parallel_safe: z.boolean(),
  depends_on: z.array(z.number().int().nonnegative()).default([]),
});
export type WorkflowStep = z.infer<typeof WorkflowStep>;

export const PlanFrontmatter = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/, 'id must be <YYYY-MM-DD>-<slug>'),
  title: z.string().min(1),
  status: PlanStatus,
  approved_at: z.preprocess(
    (v) => (v instanceof Date ? v.toISOString() : v),
    z.string().datetime().nullable(),
  ),
  dod: z.array(z.string().min(1)).min(1, 'dod is required (Goal-Driven principle)'),
  workflow: z.array(WorkflowStep).min(1),
  escape_reason: z.string().nullable().default(null),
});
export type PlanFrontmatter = z.infer<typeof PlanFrontmatter>;

export function assertWorkflowDag(workflow: WorkflowStep[]): void {
  const stepNumbers = new Set(workflow.map((s) => s.step));
  for (const s of workflow) {
    for (const dep of s.depends_on) {
      if (!stepNumbers.has(dep)) {
        throw new Error(`workflow step ${s.step} depends on missing step ${dep}`);
      }
      if (dep >= s.step) {
        throw new Error(`workflow step ${s.step} depends on later step ${dep} (cycle or forward-ref)`);
      }
    }
  }
}
