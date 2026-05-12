// contract tests for zod schemas — plan.md frontmatter, worker frontmatter, refs.yaml
import { describe, it, expect } from 'vitest';
import { PlanFrontmatter, assertWorkflowDag } from '../src/schemas/plan.js';
import { WorkerFrontmatter } from '../src/schemas/worker.js';
import { RefsYaml } from '../src/schemas/refs.js';

describe('PlanFrontmatter', () => {
  const valid = {
    id: '2026-05-12-test-slug',
    title: 'テスト',
    status: 'draft' as const,
    approved_at: null,
    dod: ['DoD 1'],
    workflow: [{ step: 1, worker: 'example-editor', parallel_safe: true, depends_on: [] }],
    escape_reason: null,
  };

  it('accepts a minimal valid plan', () => {
    expect(() => PlanFrontmatter.parse(valid)).not.toThrow();
  });

  it('rejects malformed id', () => {
    expect(() => PlanFrontmatter.parse({ ...valid, id: 'no-date' })).toThrow();
  });

  it('rejects empty dod (Goal-Driven principle)', () => {
    expect(() => PlanFrontmatter.parse({ ...valid, dod: [] })).toThrow();
  });

  it('assertWorkflowDag rejects forward-ref dependency', () => {
    expect(() =>
      assertWorkflowDag([
        { step: 1, worker: 'w', parallel_safe: true, depends_on: [2] },
        { step: 2, worker: 'w', parallel_safe: true, depends_on: [] },
      ]),
    ).toThrow();
  });

  it('assertWorkflowDag accepts valid DAG', () => {
    expect(() =>
      assertWorkflowDag([
        { step: 1, worker: 'w', parallel_safe: true, depends_on: [] },
        { step: 2, worker: 'w', parallel_safe: true, depends_on: [1] },
      ]),
    ).not.toThrow();
  });
});

describe('WorkerFrontmatter', () => {
  it('accepts analyst with read-only tools', () => {
    expect(() =>
      WorkerFrontmatter.parse({
        name: 'code-analyst',
        type: 'analyst',
        description: 'Read-only analyst',
        tools: ['Read', 'Glob', 'Grep'],
        model: 'sonnet',
        maxTurns: 15,
      }),
    ).not.toThrow();
  });

  it('rejects analyst with Edit tool', () => {
    expect(() =>
      WorkerFrontmatter.parse({
        name: 'bad-analyst',
        type: 'analyst',
        description: 'broken',
        tools: ['Read', 'Edit'],
        model: 'sonnet',
        maxTurns: 15,
      }),
    ).toThrow();
  });

  it('rejects analyst with Write tool', () => {
    expect(() =>
      WorkerFrontmatter.parse({
        name: 'bad',
        type: 'analyst',
        description: 'broken',
        tools: ['Write'],
        model: 'sonnet',
        maxTurns: 10,
      }),
    ).toThrow();
  });

  it('accepts editor with Edit/Write', () => {
    expect(() =>
      WorkerFrontmatter.parse({
        name: 'example-editor',
        type: 'editor',
        description: 'Editor',
        tools: ['Read', 'Edit', 'Write'],
        model: 'sonnet',
        maxTurns: 25,
      }),
    ).not.toThrow();
  });
});

describe('RefsYaml', () => {
  it('accepts minimal v1 refs', () => {
    expect(() =>
      RefsYaml.parse({
        version: 1,
        bootstrapped: true,
        defaults: [],
        'user-defined': [],
        'per-worker': {},
      }),
    ).not.toThrow();
  });

  it('rejects unknown auto-load mode', () => {
    expect(() =>
      RefsYaml.parse({
        version: 1,
        bootstrapped: true,
        defaults: [{ path: 'x.md', role: 'r', 'auto-load': 'invalid' }],
        'user-defined': [],
        'per-worker': {},
      }),
    ).toThrow();
  });
});
