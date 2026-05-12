// read worker definition (.harness/workers/<name>.md) with frontmatter validation
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import matter from 'gray-matter';
import { WorkerFrontmatter } from '../schemas/worker.js';
import type { WorkerFrontmatter as Worker } from '../schemas/worker.js';

export interface WorkerDefinition {
  frontmatter: Worker;
  body: string;
  filePath: string;
}

export async function readWorker(filePath: string): Promise<WorkerDefinition> {
  const raw = await readFile(filePath, 'utf8');
  const parsed = matter(raw);
  const frontmatter = WorkerFrontmatter.parse(parsed.data);
  return { frontmatter, body: parsed.content, filePath };
}

export async function listWorkers(workersDir: string): Promise<string[]> {
  try {
    const entries = await readdir(workersDir);
    return entries.filter((e) => e.endsWith('.md')).map((e) => basename(e, '.md')).sort();
  } catch {
    return [];
  }
}

export async function findWorker(workersDir: string, name: string): Promise<WorkerDefinition> {
  return readWorker(join(workersDir, `${name}.md`));
}
