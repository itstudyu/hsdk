// extracts a worker's plan section (from plan.<worker>.md or plan.md ## Task N block)
import { readFile } from 'node:fs/promises';

export async function extractPlanSection(
  planMdBody: string,
  workerPlanPath: string | undefined,
  stepNumber: number,
): Promise<string> {
  if (workerPlanPath) {
    return readFile(workerPlanPath, 'utf8');
  }
  const headingPattern = new RegExp(`^## Task ${stepNumber}\\b[\\s\\S]*?(?=^## Task \\d+\\b|\\Z)`, 'm');
  const match = planMdBody.match(headingPattern);
  if (!match) {
    throw new Error(`plan.md does not contain "## Task ${stepNumber}" section`);
  }
  return match[0];
}
