// tests for plan.md "## Task N" section extraction (lazy plan.<worker>.md inlining)
import { describe, it, expect } from 'vitest';
import { extractPlanSection } from '../src/dispatcher/extract-section.js';

const body = [
  '# Overview',
  '',
  '## Task 1',
  '目的: A',
  '入力: x',
  '',
  '## Task 2',
  '目的: B',
  '入力: y',
  '',
].join('\n');

describe('extractPlanSection', () => {
  it('extracts first task block', async () => {
    const out = await extractPlanSection(body, undefined, 1);
    expect(out).toContain('## Task 1');
    expect(out).toContain('目的: A');
    expect(out).not.toContain('## Task 2');
  });

  it('extracts last task block up to EOF', async () => {
    const out = await extractPlanSection(body, undefined, 2);
    expect(out).toContain('## Task 2');
    expect(out).toContain('目的: B');
  });

  it('throws when section is missing', async () => {
    await expect(extractPlanSection(body, undefined, 5)).rejects.toThrow();
  });
});
