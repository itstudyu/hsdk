// `hsdk init` — bootstraps .harness/ with default refs.yaml + worker templates
import { mkdir, copyFile, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveHarnessPaths } from '../io/paths.js';
import { writeRefs } from '../io/refs-file.js';
import pc from 'picocolors';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function templatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'templates');
}

export async function runInit(projectRoot: string): Promise<void> {
  const paths = resolveHarnessPaths(projectRoot);
  await mkdir(paths.workersDir, { recursive: true });
  await mkdir(paths.ticketsActive, { recursive: true });
  await mkdir(paths.ticketsDone, { recursive: true });

  const refsPath = paths.refsYaml;
  if (!(await exists(refsPath))) {
    await writeRefs(refsPath, {
      version: 1,
      bootstrapped: true,
      defaults: [
        { path: 'docs/structure.md', role: 'project-structure', 'auto-load': 'always' },
      ],
      'user-defined': [],
      'per-worker': {},
    });
    process.stdout.write(pc.green(`✓ ${refsPath}\n`));
  }

  const tpl = templatesDir();
  for (const w of ['code-analyst.md', 'example-editor.md']) {
    const dest = join(paths.workersDir, w);
    if (!(await exists(dest))) {
      await copyFile(join(tpl, w), dest);
      process.stdout.write(pc.green(`✓ ${dest}\n`));
    }
  }

  const configPath = paths.configTs;
  if (!(await exists(configPath))) {
    await writeFile(
      configPath,
      `// hsdk per-project config override\nexport default {};\n`,
      'utf8',
    );
    process.stdout.write(pc.green(`✓ ${configPath}\n`));
  }

  process.stdout.write(pc.bold('\nhsdk bootstrap complete.\n'));
  process.stdout.write(`Next: hsdk plan "<your request>"\n`);
}
