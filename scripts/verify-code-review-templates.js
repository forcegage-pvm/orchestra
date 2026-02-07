import path from 'path';
import fs from 'fs';

function normalize(s) {
  return s.replace(/\s+/g, ' ').trim();
}

async function loadTemplateLoader() {
  const mod = await import('../extension/src/prompts/TemplateLoader.ts');
  return mod.TemplateLoader ?? mod.default ?? mod;
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
    copyRecursiveSync(src, dest);
  }

  const TemplateLoader = await loadTemplateLoader();
  const loader = new TemplateLoader({ workspaceRoot, devMode: true });

  const builders = await import('../extension/src/prompts/promptTextBuilders.ts');

  // Single task code review
  const sprint = { sprint_id: 's1', title: 'Sprint One' };
  const task = { task_id: 42, title: 'Implement feature X' };
  const tSingle = loader.render('code-review', { sprint, task });
  const bSingle = builders.buildCodeReviewPromptText(0, 's1', 'Sprint One', { taskId: 42, title: 'Implement feature X', dbId: 101 });

  let diffs = 0;
  if (normalize(tSingle) !== normalize(bSingle)) {
    console.error('=== Single task output DIFFER ===');
    console.error('TEMPLATE:\n', tSingle);
    console.error('\nBUILDER:\n', bSingle);
    diffs++;
  } else {
    console.log('✅ Single task code review: MATCH');
  }

  // Bulk code review
  const tBulk = loader.render('code-review-bulk', { pendingCount: 5, sprint: { sprint_id: 's1', title: 'Sprint One' } });
  const bBulk = builders.buildCodeReviewPromptText(5, 's1', 'Sprint One');
  if (normalize(tBulk) !== normalize(bBulk)) {
    console.error('=== Bulk output DIFFER ===');
    console.error('TEMPLATE:\n', tBulk);
    console.error('\nBUILDER:\n', bBulk);
    diffs++;
  } else {
    console.log('✅ Bulk code review: MATCH');
  }

  // Re-review
  const tRe = loader.render('code-review-re-review', { sprint: { sprint_id: 's1', title: 'Sprint One' }, task: { task_id: 42, title: 'Implement feature X' }, codeReview: { reviewId: 7 } });
  const bRe = builders.buildCodeReviewReReviewPromptText('s1', 'Sprint One', { taskId: 42, title: 'Implement feature X', dbId: 101 }, 7);
  if (normalize(tRe) !== normalize(bRe)) {
    console.error('=== Re-review output DIFFER ===');
    console.error('TEMPLATE:\n', tRe);
    console.error('\nBUILDER:\n', bRe);
    diffs++;
  } else {
    console.log('✅ Re-review: MATCH');
  }

  if (diffs > 0) {
    console.error(`\n❌ ${diffs} template(s) have differences`);
    process.exit(2);
  }
  console.log('\n✅ All templates match builders (whitespace-normalized)');
}

main().catch((err) => { console.error(err); process.exit(1); });
