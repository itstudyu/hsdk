// tests for hard approval gate — refuses dispatch when approved_at is null
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertApproved, ApprovalGateError } from '../src/dispatcher/gate.js';

async function writePlan(planPath: string, approvedAt: string | null, status = 'draft'): Promise<void> {
  const fm = [
    '---',
    'id: 2026-05-12-test',
    'title: test',
    `status: ${status}`,
    `approved_at: ${approvedAt === null ? 'null' : approvedAt}`,
    'dod:',
    '  - d1',
    'workflow:',
    '  - step: 1',
    '    worker: w',
    '    parallel_safe: true',
    '    depends_on: []',
    'escape_reason: null',
    '---',
    'body',
    '',
  ].join('\n');
  await writeFile(planPath, fm, 'utf8');
}

describe('assertApproved', () => {
  let dir: string;
  let planPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hsdk-gate-'));
    planPath = join(dir, 'plan.md');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('throws when approved_at is null', async () => {
    await writePlan(planPath, null);
    await expect(assertApproved(planPath)).rejects.toBeInstanceOf(ApprovalGateError);
  });

  it('passes when approved_at is set', async () => {
    await writePlan(planPath, '2026-05-12T10:00:00.000Z', 'ready');
    await expect(assertApproved(planPath)).resolves.toBeUndefined();
  });

  it('throws when status is blocked', async () => {
    await writePlan(planPath, '2026-05-12T10:00:00.000Z', 'blocked');
    await expect(assertApproved(planPath)).rejects.toBeInstanceOf(ApprovalGateError);
  });
});
