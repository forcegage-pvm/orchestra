/* Node verification script for code review templates

This script verifies that code review templates render correctly via PromptBuilder.
The original text builder functions have been removed; this script now validates
that the template-based PromptBuilder produces the expected output.

Exit code: 0 on success, 1 on error
*/

import fs from 'fs';
import path from 'path';

function copyRecursiveSync(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursiveSync(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function copyTemplates() {
  const workspaceRoot = path.join(process.cwd(), 'extension');
  const src = path.join(workspaceRoot, 'templates', 'prompts');
  const dest = path.join(workspaceRoot, '.orchestra', 'templates', 'prompts');
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  const items = fs.readdirSync(src);
  for (const item of items) {
    copyRecursiveSync(path.join(src, item), path.join(dest, item));
  }
}

async function run() {
  try {
    copyTemplates();
    const workspaceRoot = path.join(process.cwd(), 'extension');

    const { PromptBuilder } = await import('../extension/src/prompts/PromptBuilder.ts');
    const { TemplateLoader } = await import('../extension/src/prompts/TemplateLoader.ts');

    const builder = new PromptBuilder({
      templateLoader: new TemplateLoader({ workspaceRoot, devMode: true }),
    });

    // Single task code review
    const single = builder.buildCodeReviewPrompt(0, 's1', 'Sprint One', { taskId: 42, title: 'Implement feature X', dbId: 101 });
    if (!single.includes('Task 42') || !single.includes('Sprint One')) {
      console.error('Single task template missing expected content');
      process.exitCode = 1;
      return;
    }
    console.log('✅ Single task code review renders correctly');

    // Bulk code review
    const bulk = builder.buildCodeReviewPrompt(5, 's1', 'Sprint One');
    if (!bulk.includes('5 pending task(s)') || !bulk.includes('Sprint One')) {
      console.error('Bulk template missing expected content');
      process.exitCode = 1;
      return;
    }
    console.log('✅ Bulk code review renders correctly');

    // Re-review
    const re = builder.buildCodeReviewReReviewPrompt('s1', 'Sprint One', { taskId: 42, title: 'Implement feature X', dbId: 101 }, 7);
    if (!re.includes('re-review') || !re.includes('Task 42') || !re.includes('Review ID')) {
      console.error('Re-review template missing expected content');
      process.exitCode = 1;
      return;
    }
    console.log('✅ Re-review renders correctly');

    console.log('\n✅ All code review templates verified');
    process.exitCode = 0;
  } catch (err) {
    console.error('Error during verification:', err);
    process.exitCode = 1;
  }
}

run();
