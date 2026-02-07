import path from 'path';
import fs from 'fs';
// builders will be dynamically imported to avoid ESM resolution issues
function normalize(s) {
  return s.replace(/\s+/g, ' ').trim();
}
async function loadTemplateLoader() {
  // Dynamically import to avoid ESM named export resolution issues
const mod = await import('../extension/src/prompts/TemplateLoader.ts');  return mod.TemplateLoader ?? mod.default ?? mod;
}

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

async function main() {
  const workspaceRoot = path.join(process.cwd(), 'extension');
  const templatesSrc = path.join(workspaceRoot, 'templates', 'prompts');
  const templatesDest = path.join(workspaceRoot, '.orchestra', 'templates', 'prompts');

  if (!fs.existsSync(templatesDest)) {
    fs.mkdirSync(templatesDest, { recursive: true });
  }

  const files = fs.readdirSync(templatesSrc);
  for (const file of files) {
    const src = path.join(templatesSrc, file);
    const dest = path.join(templatesDest, file);
    // Copy files and directories recursively (partials are in a subdirectory)
    copyRecursiveSync(src, dest);
  }

  const TemplateLoader = await loadTemplateLoader();
  const loaders = new TemplateLoader({ workspaceRoot, devMode: true });
  const loader = loaders; // keep variable name from before

  const buildersMod = await import('../extension/src/prompts/promptTextBuilders.ts');
  // Support both named and default exports
  // Single
  const sprint = { sprint_id: 's1', title: 'Sprint One' };
  const task = { task_id: 42, title: 'Implement feature X' };
  const tSingle = loader.render('code-review', { sprint, task });

  // Use exported router to obtain builder output for single task
  const bSingle = builders.buildCodeReviewPromptText(0, 's1', 'Sprint One', { taskId: 42, title: 'Implement feature X', dbId: 101 });
  if (normalize(tSingle) !== normalize(bSingle)) {
    console.error('Single task output DIFFER:');
    console.error('TEMPLATE:\n', tSingle);
    console.error('\nBUILDER:\n', bSingle);
    process.exit(2);
  }

  // Bulk
  const tBulk = loader.render('code-review-bulk', { pendingCount: 5, sprint: { sprint_id: 's1', title: 'Sprint One' } });
  const bBulk = builders.buildCodeReviewPromptText(5, 's1', 'Sprint One');
  if (normalize(tBulk) !== normalize(bBulk)) {
    console.error('Bulk output DIFFER:');
    console.error('TEMPLATE:\n', tBulk);
    console.error('\nBUILDER:\n', bBulk);
    process.exit(2);
  }

  // Re-review
  const tRe = loader.render('code-review-re-review', { sprint: { sprint_id: 's1', title: 'Sprint One' }, task: { task_id: 42, title: 'Implement feature X' }, codeReview: { reviewId: 7 } });
  const bRe = builders.buildCodeReviewReReviewPromptText('s1', 'Sprint One', { taskId: 42, title: 'Implement feature X', dbId: 101 }, 7);
  if (normalize(tRe) !== normalize(bRe)) {
    console.error('Re-review output DIFFER:');
    console.error('TEMPLATE:\n', tRe);
    console.error('\nBUILDER:\n', bRe);
    process.exit(2);
  }
  console.log('All templates match builders');
}

main().catch((err) => { console.error(err); process.exit(1); });