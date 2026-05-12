// hard approval gate: refuses dispatch unless plan.md frontmatter approved_at is set
import { readPlanFile } from '../io/plan-file.js';

export class ApprovalGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalGateError';
  }
}

export async function assertApproved(planMdPath: string): Promise<void> {
  const plan = await readPlanFile(planMdPath);
  if (!plan.frontmatter.approved_at) {
    throw new ApprovalGateError(
      `plan.md is not approved (approved_at is null). Run grilling and approve before dispatch.`,
    );
  }
  if (plan.frontmatter.status === 'blocked') {
    throw new ApprovalGateError(`plan.md status is "blocked". Cannot dispatch.`);
  }
}
