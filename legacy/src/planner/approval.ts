// interactive [a]pprove / [e]dit / [r]eject prompt that writes approved_at on accept
import { spawn } from 'node:child_process';
import prompts from 'prompts';
import { readPlanFile, setApprovedAt, writePlanFile } from '../io/plan-file.js';

export type ApprovalChoice = 'approve' | 'edit' | 'reject';

export async function runApprovalLoop(planMdPath: string): Promise<ApprovalChoice> {
  while (true) {
    const plan = await readPlanFile(planMdPath);
    process.stdout.write('\n========== plan.md ==========\n');
    process.stdout.write(`title: ${plan.frontmatter.title}\n`);
    process.stdout.write(`id: ${plan.frontmatter.id}\n`);
    process.stdout.write(`dod:\n${plan.frontmatter.dod.map((d) => `  - ${d}`).join('\n')}\n`);
    process.stdout.write(`workflow:\n`);
    for (const step of plan.frontmatter.workflow) {
      process.stdout.write(`  step ${step.step}: ${step.worker} (parallel=${step.parallel_safe}, deps=[${step.depends_on.join(',')}])\n`);
    }
    process.stdout.write('\n--- body ---\n');
    process.stdout.write(plan.body);
    process.stdout.write('\n=============================\n');

    const response = await prompts({
      type: 'select',
      name: 'choice',
      message: 'plan を承認しますか?',
      choices: [
        { title: '[a]pprove — approved_at を記録して dispatch 可能にする', value: 'approve' },
        { title: '[e]dit — $EDITOR で plan.md を編集', value: 'edit' },
        { title: '[r]eject — ticket を破棄', value: 'reject' },
      ],
      initial: 0,
    });

    const choice = response.choice as ApprovalChoice | undefined;
    if (!choice) return 'reject';

    if (choice === 'approve') {
      await setApprovedAt(planMdPath, new Date().toISOString());
      return 'approve';
    }
    if (choice === 'reject') {
      await writePlanFile(planMdPath, {
        frontmatter: { ...plan.frontmatter, status: 'blocked' },
        body: plan.body,
      });
      return 'reject';
    }
    await openInEditor(planMdPath);
  }
}

async function openInEditor(path: string): Promise<void> {
  const editor = process.env.EDITOR ?? 'vi';
  await new Promise<void>((resolve, reject) => {
    const child = spawn(editor, [path], { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`editor exited ${code}`))));
    child.on('error', reject);
  });
}
