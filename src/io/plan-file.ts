// read/write plan.md with frontmatter via gray-matter, validated by zod
import { readFile, writeFile } from 'node:fs/promises';
import matter from 'gray-matter';
import { PlanFrontmatter, assertWorkflowDag } from '../schemas/plan.js';
import type { PlanFrontmatter as Plan } from '../schemas/plan.js';
import { PLAN_MD, assertWithinHardCap } from './lengths.js';

export interface PlanFile {
  frontmatter: Plan;
  body: string;
}

export async function readPlanFile(path: string): Promise<PlanFile> {
  const raw = await readFile(path, 'utf8');
  const parsed = matter(raw);
  const frontmatter = PlanFrontmatter.parse(parsed.data);
  assertWorkflowDag(frontmatter.workflow);
  return { frontmatter, body: parsed.content };
}

export async function writePlanFile(path: string, file: PlanFile): Promise<void> {
  PlanFrontmatter.parse(file.frontmatter);
  assertWorkflowDag(file.frontmatter.workflow);
  assertWithinHardCap(file.body, PLAN_MD, {
    escapeReason: file.frontmatter.escape_reason,
    label: 'plan.md',
  });
  const serialized = matter.stringify(file.body, file.frontmatter as Record<string, unknown>);
  await writeFile(path, serialized, 'utf8');
}

export async function setApprovedAt(path: string, isoTimestamp: string): Promise<void> {
  const current = await readPlanFile(path);
  await writePlanFile(path, {
    frontmatter: { ...current.frontmatter, approved_at: isoTimestamp, status: 'ready' },
    body: current.body,
  });
}

export async function setStatus(path: string, status: Plan['status']): Promise<void> {
  const current = await readPlanFile(path);
  await writePlanFile(path, {
    frontmatter: { ...current.frontmatter, status },
    body: current.body,
  });
}
