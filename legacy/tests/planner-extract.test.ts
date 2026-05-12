// tests for planner final-message plan.md fenced-block extraction
import { describe, it, expect } from 'vitest';
import { extractPlanBlock, extractWorkerPlanBlocks } from '../src/planner/run.js';

describe('extractPlanBlock', () => {
  it('extracts a ```plan.md``` fenced block', () => {
    const final = [
      'OK では plan を出力します。',
      '',
      '```plan.md',
      '---',
      'id: 2026-05-12-test',
      'title: テスト',
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
      '...',
      '```',
      '',
      '以上です。',
    ].join('\n');
    const out = extractPlanBlock(final);
    expect(out).not.toBeNull();
    expect(out).toContain('id: 2026-05-12-test');
    expect(out).toContain('# Overview');
  });

  it('returns null when no fenced block is present', () => {
    expect(extractPlanBlock('plain text only')).toBeNull();
  });
});

describe('extractWorkerPlanBlocks', () => {
  it('extracts multiple worker plan blocks', () => {
    const final = [
      '```plan.md',
      '---',
      'id: 2026-05-12-x',
      '---',
      '# overview',
      '```',
      '',
      '```plan.analyst.md',
      '# Task: 調査',
      '- 目的: x',
      '```',
      '',
      '```plan.editor.md',
      '# Task: 実装',
      '- 目的: y',
      '```',
    ].join('\n');
    const blocks = extractWorkerPlanBlocks(final);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ worker: 'analyst' });
    expect(blocks[0]!.content).toContain('調査');
    expect(blocks[1]).toMatchObject({ worker: 'editor' });
    expect(blocks[1]!.content).toContain('実装');
  });

  it('returns empty array when no worker blocks present', () => {
    expect(extractWorkerPlanBlocks('```plan.md\n---\n---\n```\n')).toEqual([]);
  });
});
