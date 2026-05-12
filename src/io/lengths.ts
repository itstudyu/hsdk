// length caps from hsdk design spec v4 (Anthropic + Lost-in-the-Middle 基準)
export interface LengthCap {
  soft: number;
  hard: number;
}

export const PLAN_MD: LengthCap = { soft: 60, hard: 120 };
export const PLAN_WORKER_MD: LengthCap = { soft: 80, hard: 200 };
export const RESULTS_MD: LengthCap = { soft: 100, hard: 300 };

export function countLines(content: string): number {
  if (content.length === 0) return 0;
  return content.split(/\r?\n/).length;
}

export type CapTier = 'ok' | 'soft' | 'hard';

export function classify(lines: number, cap: LengthCap): CapTier {
  if (lines > cap.hard) return 'hard';
  if (lines > cap.soft) return 'soft';
  return 'ok';
}

export interface CapAssertOptions {
  escapeReason: string | null;
  label: string;
}

export class LengthCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LengthCapError';
  }
}

export function assertWithinHardCap(content: string, cap: LengthCap, opts: CapAssertOptions): void {
  const lines = countLines(content);
  if (lines > cap.hard && !opts.escapeReason) {
    throw new LengthCapError(
      `${opts.label} exceeds hard cap (${lines} > ${cap.hard} lines). Set frontmatter escape_reason or vertical-split the ticket.`,
    );
  }
}
