// append-only writer for ticket results.md, with hard-cap split to results.<worker>.md
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { RESULTS_MD, countLines } from './lengths.js';

async function fileLineCount(path: string): Promise<number> {
  try {
    await stat(path);
  } catch {
    return 0;
  }
  const raw = await readFile(path, 'utf8');
  return countLines(raw);
}

export async function appendResult(
  resultsPath: string,
  worker: string,
  output: string,
): Promise<void> {
  await mkdir(dirname(resultsPath), { recursive: true });
  const stamp = new Date().toISOString();
  const block = `\n---\n\n## ${worker} (${stamp})\n\n${output.trim()}\n`;

  const existing = await fileLineCount(resultsPath);
  const blockLines = countLines(block);
  if (existing + blockLines > RESULTS_MD.hard) {
    const split = join(dirname(resultsPath), `results.${worker}.md`);
    await appendFile(split, block, 'utf8');
    const pointer = `\n- see [\`${basename(split)}\`](./${basename(split)}) — ${worker} @ ${stamp} (results.md hard cap ${RESULTS_MD.hard} 行 超過のため分離)\n`;
    await appendFile(resultsPath, pointer, 'utf8');
    return;
  }
  await appendFile(resultsPath, block, 'utf8');
}
