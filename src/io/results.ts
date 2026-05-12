// append-only writer for ticket results.md
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function appendResult(
  resultsPath: string,
  worker: string,
  output: string,
): Promise<void> {
  await mkdir(dirname(resultsPath), { recursive: true });
  const stamp = new Date().toISOString();
  const block = `\n---\n\n## ${worker} (${stamp})\n\n${output.trim()}\n`;
  await appendFile(resultsPath, block, 'utf8');
}
