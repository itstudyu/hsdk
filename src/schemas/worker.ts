// worker frontmatter zod schema enforcing analyst tool restrictions
import { z } from 'zod';

export const WorkerType = z.enum(['analyst', 'editor']);
export type WorkerType = z.infer<typeof WorkerType>;

export const WorkerModel = z.enum(['haiku', 'sonnet', 'opus']);
export type WorkerModel = z.infer<typeof WorkerModel>;

const FORBIDDEN_FOR_ANALYST = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);

export const WorkerFrontmatter = z
  .object({
    name: z.string().min(1),
    type: WorkerType,
    description: z.string().min(1),
    tools: z.array(z.string().min(1)).min(1),
    model: WorkerModel.default('sonnet'),
    maxTurns: z.number().int().positive().default(20),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'analyst') {
      for (const t of data.tools) {
        if (FORBIDDEN_FOR_ANALYST.has(t)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tools'],
            message: `analyst worker cannot use ${t} (Edit/Write/NotebookEdit/MultiEdit forbidden)`,
          });
        }
      }
    }
  });
export type WorkerFrontmatter = z.infer<typeof WorkerFrontmatter>;
