// ticket lifecycle helpers (create active dir, move to done)
import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveHarnessPaths, ticketDir } from './paths.js';
import type { HarnessPaths } from './paths.js';

export async function ensureTicketDir(paths: HarnessPaths, id: string): Promise<string> {
  const dir = ticketDir(paths, id, 'active');
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function moveTicketToDone(paths: HarnessPaths, id: string): Promise<string> {
  const from = ticketDir(paths, id, 'active');
  const to = ticketDir(paths, id, 'done');
  await mkdir(paths.ticketsDone, { recursive: true });
  await rename(from, to);
  return to;
}

export async function listActiveTickets(projectRoot: string): Promise<string[]> {
  const paths = resolveHarnessPaths(projectRoot);
  try {
    const entries = await readdir(paths.ticketsActive);
    const dirs: string[] = [];
    for (const e of entries) {
      const s = await stat(join(paths.ticketsActive, e));
      if (s.isDirectory()) dirs.push(e);
    }
    return dirs.sort();
  } catch {
    return [];
  }
}
