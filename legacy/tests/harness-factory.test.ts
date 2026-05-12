// smoke tests for createHarness library API (spec A3)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHarness } from '../src/lib/index.js';

describe('createHarness', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'hsdk-harness-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns a harness object with the expected shape', () => {
    const h = createHarness({ projectRoot: root });
    expect(typeof h.plan).toBe('function');
    expect(typeof h.approve).toBe('function');
    expect(typeof h.run).toBe('function');
    expect(typeof h.status).toBe('function');
    expect(h.paths.harness).toBe(join(root, '.harness'));
  });

  it('status() returns empty array when no tickets exist', async () => {
    const h = createHarness({ projectRoot: root });
    const list = await h.status();
    expect(list).toEqual([]);
  });

  it('status() reports ticket state from plan.md frontmatter', async () => {
    const h = createHarness({ projectRoot: root });
    const ticketId = '2026-05-13-demo';
    const tDir = join(h.paths.ticketsActive, ticketId);
    await mkdir(tDir, { recursive: true });
    const fm = [
      '---',
      'id: 2026-05-13-demo',
      'title: デモ',
      'status: draft',
      'approved_at: null',
      'dod:',
      '  - d1',
      'workflow:',
      '  - step: 1',
      '    worker: example-editor',
      '    parallel_safe: true',
      '    depends_on: []',
      'escape_reason: null',
      '---',
      '# Overview',
      '',
      '## Task 1',
      '目的: x',
      '',
    ].join('\n');
    await writeFile(join(tDir, 'plan.md'), fm, 'utf8');
    const list = await h.status();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: ticketId, status: 'draft', approved: false, title: 'デモ' });
  });
});
