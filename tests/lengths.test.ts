// tests for length caps + hard-cap enforcement (spec C threshold table)
import { describe, it, expect } from 'vitest';
import {
  PLAN_MD,
  PLAN_WORKER_MD,
  RESULTS_MD,
  countLines,
  classify,
  assertWithinHardCap,
  LengthCapError,
} from '../src/io/lengths.js';

describe('length caps', () => {
  it('matches spec v4 thresholds', () => {
    expect(PLAN_MD).toEqual({ soft: 60, hard: 120 });
    expect(PLAN_WORKER_MD).toEqual({ soft: 80, hard: 200 });
    expect(RESULTS_MD).toEqual({ soft: 100, hard: 300 });
  });
});

describe('countLines', () => {
  it('counts empty string as 0', () => {
    expect(countLines('')).toBe(0);
  });
  it('counts single line as 1', () => {
    expect(countLines('one')).toBe(1);
  });
  it('counts trailing newline as separate line', () => {
    expect(countLines('one\n')).toBe(2);
  });
});

describe('classify', () => {
  it('returns ok within soft', () => {
    expect(classify(50, PLAN_MD)).toBe('ok');
  });
  it('returns soft between soft and hard', () => {
    expect(classify(100, PLAN_MD)).toBe('soft');
  });
  it('returns hard beyond hard', () => {
    expect(classify(200, PLAN_MD)).toBe('hard');
  });
});

describe('assertWithinHardCap', () => {
  it('throws when over hard cap without escape_reason', () => {
    const body = 'x\n'.repeat(PLAN_MD.hard + 5);
    expect(() => assertWithinHardCap(body, PLAN_MD, { escapeReason: null, label: 'plan.md' })).toThrow(
      LengthCapError,
    );
  });
  it('passes when over hard cap with escape_reason', () => {
    const body = 'x\n'.repeat(PLAN_MD.hard + 5);
    expect(() =>
      assertWithinHardCap(body, PLAN_MD, { escapeReason: 'vertical split impossible', label: 'plan.md' }),
    ).not.toThrow();
  });
  it('passes within soft cap', () => {
    expect(() =>
      assertWithinHardCap('one\ntwo\n', PLAN_MD, { escapeReason: null, label: 'plan.md' }),
    ).not.toThrow();
  });
});
