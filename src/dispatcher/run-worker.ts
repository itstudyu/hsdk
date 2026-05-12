// dispatches one worker via Claude Agent SDK sub-agent and collects output text
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { WorkerDefinition } from '../io/worker-file.js';

export interface RunWorkerInput {
  projectRoot: string;
  worker: WorkerDefinition;
  systemPrompt: string;
  userPrompt: string;
}

export interface WorkerResult {
  worker: string;
  output: string;
  hasResult: boolean;
  hasDodVerification: boolean;
}

function modelFromShort(short: 'haiku' | 'sonnet' | 'opus'): string {
  if (short === 'haiku') return 'claude-haiku-4-5-20251001';
  if (short === 'opus') return 'claude-opus-4-7';
  return 'claude-sonnet-4-6';
}

export async function runWorker(input: RunWorkerInput): Promise<WorkerResult> {
  const fm = input.worker.frontmatter;
  const result = query({
    prompt: input.userPrompt,
    options: {
      systemPrompt: input.systemPrompt,
      allowedTools: fm.tools,
      cwd: input.projectRoot,
      model: modelFromShort(fm.model),
      maxTurns: fm.maxTurns,
    },
  });

  let collected = '';
  for await (const message of result) {
    if (message.type !== 'assistant') continue;
    for (const block of message.message.content) {
      if (block.type === 'text') collected += block.text;
    }
  }

  return {
    worker: fm.name,
    output: collected,
    hasResult: /^## Result:/m.test(collected),
    hasDodVerification: /^## DoD verification/m.test(collected),
  };
}
