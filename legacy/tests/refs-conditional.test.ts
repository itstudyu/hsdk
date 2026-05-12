// tests for conditional auto-load (keywords match against plan section)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkerPrompt } from '../src/dispatcher/worker-prompt.js';

describe('buildWorkerPrompt conditional auto-load', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hsdk-refs-'));
    await mkdir(join(dir, 'docs'), { recursive: true });
    await writeFile(join(dir, 'docs', 'auth.md'), '# auth doc body', 'utf8');
    await writeFile(join(dir, 'docs', 'misc.md'), '# misc doc body', 'utf8');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const worker = {
    frontmatter: {
      name: 'example-editor',
      type: 'editor' as const,
      description: 'd',
      tools: ['Read'],
      model: 'sonnet' as const,
      maxTurns: 10,
    },
    body: '# Worker body',
    filePath: '/tmp/example-editor.md',
  };

  it('includes conditional ref when keyword matches plan section', async () => {
    const prompt = await buildWorkerPrompt({
      projectRoot: dir,
      worker,
      planSection: '## Task 1\n認証 (auth) を実装する',
      refs: {
        version: 1,
        bootstrapped: true,
        defaults: [],
        'user-defined': [
          { path: 'docs/auth.md', role: 'auth-spec', 'auto-load': 'conditional', keywords: ['auth', '認証'] },
        ],
        'per-worker': {},
      },
    });
    expect(prompt).toContain('# auth doc body');
  });

  it('excludes conditional ref when no keyword matches', async () => {
    const prompt = await buildWorkerPrompt({
      projectRoot: dir,
      worker,
      planSection: '## Task 1\nUI コンポーネントを追加',
      refs: {
        version: 1,
        bootstrapped: true,
        defaults: [],
        'user-defined': [
          { path: 'docs/auth.md', role: 'auth-spec', 'auto-load': 'conditional', keywords: ['auth'] },
        ],
        'per-worker': {},
      },
    });
    expect(prompt).not.toContain('# auth doc body');
  });

  it('excludes manual refs regardless of keywords', async () => {
    const prompt = await buildWorkerPrompt({
      projectRoot: dir,
      worker,
      planSection: 'auth',
      refs: {
        version: 1,
        bootstrapped: true,
        defaults: [],
        'user-defined': [
          { path: 'docs/auth.md', role: 'auth-spec', 'auto-load': 'manual', keywords: ['auth'] },
        ],
        'per-worker': {},
      },
    });
    expect(prompt).not.toContain('# auth doc body');
  });

  it('omits "Files changed" section for analyst workers (spec H)', async () => {
    const analyst = {
      ...worker,
      frontmatter: { ...worker.frontmatter, type: 'analyst' as const, tools: ['Read'] },
    };
    const prompt = await buildWorkerPrompt({
      projectRoot: dir,
      worker: analyst,
      planSection: '## Task 1\n調査',
      refs: { version: 1, bootstrapped: true, defaults: [], 'user-defined': [], 'per-worker': {} },
    });
    expect(prompt).not.toMatch(/^## Files changed/m);
    expect(prompt).toMatch(/^## Result/m);
    expect(prompt).toMatch(/^## DoD verification/m);
  });

  it('includes "Files changed" section for editor workers', async () => {
    const prompt = await buildWorkerPrompt({
      projectRoot: dir,
      worker,
      planSection: '## Task 1\n実装',
      refs: { version: 1, bootstrapped: true, defaults: [], 'user-defined': [], 'per-worker': {} },
    });
    expect(prompt).toMatch(/^## Files changed/m);
  });
});
