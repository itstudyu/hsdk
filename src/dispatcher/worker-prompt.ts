// builds the per-worker sub-agent prompt with refs injection
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RefsYaml, RefEntry } from '../schemas/refs.js';
import type { WorkerDefinition } from '../io/worker-file.js';

export interface WorkerPromptInput {
  projectRoot: string;
  worker: WorkerDefinition;
  planSection: string;
  refs: RefsYaml;
}

function matchesConditional(entry: RefEntry, planSection: string): boolean {
  const kws = entry.keywords ?? [];
  if (kws.length === 0) return false;
  const haystack = planSection.toLowerCase();
  return kws.some((k) => haystack.includes(k.toLowerCase()));
}

function selectEntries(refs: RefsYaml, workerName: string, planSection: string): RefEntry[] {
  const all = [
    ...refs.defaults,
    ...refs['user-defined'],
    ...(refs['per-worker'][workerName] ?? []),
  ];
  const selected: RefEntry[] = [];
  for (const e of all) {
    if (e['auto-load'] === 'always') selected.push(e);
    else if (e['auto-load'] === 'conditional' && matchesConditional(e, planSection)) selected.push(e);
    // 'manual' は injection 対象外
  }
  return selected;
}

async function loadRefs(
  projectRoot: string,
  refs: RefsYaml,
  workerName: string,
  planSection: string,
): Promise<string> {
  const entries = selectEntries(refs, workerName, planSection);
  const blocks: string[] = [];
  for (const e of entries) {
    try {
      const content = await readFile(join(projectRoot, e.path), 'utf8');
      blocks.push(`## ref: ${e.path} (${e.role})\n${content}`);
    } catch {
      blocks.push(`## ref: ${e.path} (missing)`);
    }
  }
  return blocks.join('\n\n');
}

export async function buildWorkerPrompt(input: WorkerPromptInput): Promise<string> {
  const refsBlock = await loadRefs(
    input.projectRoot,
    input.refs,
    input.worker.frontmatter.name,
    input.planSection,
  );
  return [
    `# Worker: ${input.worker.frontmatter.name} (${input.worker.frontmatter.type})`,
    input.worker.body,
    refsBlock ? `# References\n${refsBlock}` : '',
    `# Your Task\n${input.planSection}`,
    `# Output Format\n## Result: success | partial | failure\n## Files changed: <path: reason>\n## DoD verification: <checklist>\n## Notes: <free-form>`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
