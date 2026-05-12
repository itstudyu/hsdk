// resolves .harness/ filesystem paths for a given project root
import { join } from 'node:path';

export interface HarnessPaths {
  root: string;
  harness: string;
  configTs: string;
  refsYaml: string;
  workersDir: string;
  ticketsActive: string;
  ticketsDone: string;
}

export function resolveHarnessPaths(projectRoot: string): HarnessPaths {
  const harness = join(projectRoot, '.harness');
  return {
    root: projectRoot,
    harness,
    configTs: join(harness, 'config.ts'),
    refsYaml: join(harness, 'refs.yaml'),
    workersDir: join(harness, 'workers'),
    ticketsActive: join(harness, 'tickets', 'active'),
    ticketsDone: join(harness, 'tickets', 'done'),
  };
}

export function ticketDir(paths: HarnessPaths, id: string, state: 'active' | 'done' = 'active'): string {
  return join(state === 'active' ? paths.ticketsActive : paths.ticketsDone, id);
}

export function planMdPath(ticketDirPath: string): string {
  return join(ticketDirPath, 'plan.md');
}

export function planWorkerPath(ticketDirPath: string, worker: string): string {
  return join(ticketDirPath, `plan.${worker}.md`);
}

export function resultsMdPath(ticketDirPath: string): string {
  return join(ticketDirPath, 'results.md');
}

export function workerFile(paths: HarnessPaths, name: string): string {
  return join(paths.workersDir, `${name}.md`);
}
