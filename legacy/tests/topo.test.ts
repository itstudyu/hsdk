// tests for dispatcher topo scheduler — parallel_safe batches + dependency ordering
import { describe, it, expect } from 'vitest';
import { scheduleBatches } from '../src/dispatcher/topo.js';

describe('scheduleBatches', () => {
  it('batches independent parallel_safe steps together', () => {
    const batches = scheduleBatches([
      { step: 1, worker: 'a', parallel_safe: true, depends_on: [] },
      { step: 2, worker: 'b', parallel_safe: true, depends_on: [] },
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.map((s) => s.step).sort()).toEqual([1, 2]);
  });

  it('serializes non-parallel-safe steps', () => {
    const batches = scheduleBatches([
      { step: 1, worker: 'a', parallel_safe: false, depends_on: [] },
      { step: 2, worker: 'b', parallel_safe: false, depends_on: [] },
    ]);
    expect(batches).toHaveLength(2);
  });

  it('respects depends_on ordering', () => {
    const batches = scheduleBatches([
      { step: 1, worker: 'a', parallel_safe: true, depends_on: [] },
      { step: 2, worker: 'b', parallel_safe: true, depends_on: [1] },
    ]);
    expect(batches).toHaveLength(2);
    expect(batches[0]![0]!.step).toBe(1);
    expect(batches[1]![0]!.step).toBe(2);
  });
});
