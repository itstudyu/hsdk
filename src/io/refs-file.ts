// read/write .harness/refs.yaml with zod validation
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import YAML from 'yaml';
import { RefsYaml } from '../schemas/refs.js';
import type { RefsYaml as Refs } from '../schemas/refs.js';

export async function readRefs(path: string): Promise<Refs> {
  const raw = await readFile(path, 'utf8');
  const parsed = YAML.parse(raw);
  return RefsYaml.parse(parsed);
}

export async function writeRefs(path: string, refs: Refs): Promise<void> {
  const validated = RefsYaml.parse(refs);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, YAML.stringify(validated), 'utf8');
}
