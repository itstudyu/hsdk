// topological scheduler that yields parallel-safe batches of workflow steps
import type { WorkflowStep } from '../schemas/plan.js';

export function scheduleBatches(workflow: WorkflowStep[]): WorkflowStep[][] {
  const remaining = new Map(workflow.map((s) => [s.step, s] as const));
  const done = new Set<number>();
  const batches: WorkflowStep[][] = [];

  while (remaining.size > 0) {
    const ready: WorkflowStep[] = [];
    for (const step of remaining.values()) {
      if (step.depends_on.every((d) => done.has(d))) ready.push(step);
    }
    if (ready.length === 0) {
      throw new Error(`workflow has unresolvable dependencies: ${[...remaining.keys()].join(',')}`);
    }
    const allParallel = ready.every((s) => s.parallel_safe);
    const batch = allParallel ? ready : [ready[0]!];
    batches.push(batch);
    for (const s of batch) {
      done.add(s.step);
      remaining.delete(s.step);
    }
  }

  return batches;
}
