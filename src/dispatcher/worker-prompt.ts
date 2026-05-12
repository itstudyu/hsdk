// builds the per-worker sub-agent prompt with refs injection
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RefsYaml } from '../schemas/refs.js';
import type { WorkerDefinition } from '../io/worker-file.js';

export interface WorkerPromptInput {
  projectRoot: string;
  worker: WorkerDefinition;
  planSection: string;
  refs: RefsYaml;
}

async function loadRefs(projectRoot: string, refs: RefsYaml, workerName: string): Promise<string> {
  const entries = [
    ...refs.defaults.filter((r) => r['auto-load'] === 'always'),
    ...refs['user-defined'].filter((r) => r['auto-load'] === 'always'),
    ...(refs['per-worker'][workerName] ?? []).filter((r) => r['auto-load'] === 'always'),
  ];
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
  const refsBlock = await loadRefs(input.projectRoot, input.refs, input.worker.frontmatter.name);
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
