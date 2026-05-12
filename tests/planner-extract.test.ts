// tests for planner final-message plan.md fenced-block extraction
import { describe, it, expect } from 'vitest';
import { extractPlanBlock } from '../src/planner/run.js';

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
