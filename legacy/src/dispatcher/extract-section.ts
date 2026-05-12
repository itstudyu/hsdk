// extracts a worker's plan section (from plan.<worker>.md or plan.md ## Task N block)
import { readFile } from 'node:fs/promises';
import { PLAN_WORKER_MD, assertWithinHardCap } from '../io/lengths.js';

export async function extractPlanSection(
  planMdBody: string,
  workerPlanPath: string | undefined,
  stepNumber: number,
  escapeReason: string | null = null,
): Promise<string> {
  if (workerPlanPath) {
    const content = await readFile(workerPlanPath, 'utf8');
    assertWithinHardCap(content, PLAN_WORKER_MD, {
      escapeReason,
      label: workerPlanPath,
    });
    return content;
  }
  const headingPattern = new RegExp(`^## Task ${stepNumber}\\b[\\s\\S]*?(?=^## Task \\d+\\b|(?![\\s\\S]))`, 'm');
  const match = planMdBody.match(headingPattern);
  if (!match) {
    throw new Error(`plan.md does not contain "## Task ${stepNumber}" section`);
  }
  return match[0];
}
