// refs.yaml zod schema for always/conditional/manual + per-worker references
import { z } from 'zod';

export const AutoLoadMode = z.enum(['always', 'conditional', 'manual']);
export type AutoLoadMode = z.infer<typeof AutoLoadMode>;

export const RefEntry = z.object({
  path: z.string().min(1),
  role: z.string().min(1),
  'auto-load': AutoLoadMode,
  keywords: z.array(z.string()).optional(),
});
export type RefEntry = z.infer<typeof RefEntry>;

export const RefsYaml = z.object({
  version: z.literal(1),
  bootstrapped: z.boolean(),
  defaults: z.array(RefEntry).default([]),
  'user-defined': z.array(RefEntry).default([]),
  'per-worker': z.record(z.string(), z.array(RefEntry)).default({}),
});
export type RefsYaml = z.infer<typeof RefsYaml>;
