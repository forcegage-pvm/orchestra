/* Node verification script for code review templates

This script performs the equivalence verification described in Task 7:
- Copies templates from extension/templates/prompts/ to extension/.orchestra/templates/prompts/
- Instantiates TemplateLoader with workspace root 'extension'
- Creates example context objects
- Renders templates and calls original text builders
- Compares outputs (whitespace-normalized) and reports differences

Exit code: 0 on success (no diffs), 1 on difference or error
*/

import fs from 'fs';
import path from 'path';
import * as loaderMod from '../extension/src/prompts/TemplateLoader.js';
const TemplateLoader = loaderMod.TemplateLoader;import * as builders from '../extension/src/prompts/promptTextBuilders.js';

function normalize(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function copyTemplates() {
  const workspaceRoot = path.join(process.cwd(), 'extension');
  const src = path.join(workspaceRoot, 'templates', 'prompts');
  const dest = path.join(workspaceRoot, '.orchestra', 'templates', 'prompts');
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const file of fs.readdirSync(src)) {
    const s = path.join(src, file);
    const d = path.join(dest, file);
    fs.copyFileSync(s, d);
  }
}

async function run() {
  try {
    copyTemplates();
    const workspaceRoot = path.join(process.cwd(), 'extension');
    const loader = new TemplateLoader({ workspaceRoot, devMode: true });

    // Single task
    const sprint = { sprint_id: 's1', title: 'Sprint One' };
    const task = { task_id: 42, title: 'Implement feature X' };
    const templSingle = loader.render('code-review', { sprint, task });
    const buildSingle = builders.buildSingleTaskCodeReviewPromptText(
      sprint.sprint_id,
      sprint.title,
      task.task_id,
      task.title,
    );

    if (normalize(templSingle) !== normalize(buildSingle)) {
      console.error('Single task template DOES NOT MATCH builder output');
      console.error('--- TEMPLATE ---');
      console.error(templSingle);
      console.error('--- BUILDER ---');
      console.error(buildSingle);
      process.exitCode = 1;
      return;
    }

    // Bulk
    const pendingCount = 5;
    const sprintId = 's1';
    const sprintTitle = 'Sprint One';
    const templBulk = loader.render('code-review-bulk', {
      pendingCount,
      sprint: { sprint_id: sprintId, title: sprintTitle },
    });
    const buildBulk = builders.buildBulkCodeReviewPromptText(
      pendingCount,
      sprintId,
      sprintTitle,
    );

    if (normalize(templBulk) !== normalize(buildBulk)) {
      console.error('Bulk template DOES NOT MATCH builder output');
      console.error('--- TEMPLATE ---');
      console.error(templBulk);
      console.error('--- BUILDER ---');
      console.error(buildBulk);
      process.exitCode = 1;
      return;
    }

    // Re-review
    const taskInfo = { taskId: 42, title: 'Implement feature X', dbId: 101 };
    const reviewId = 7;
    const templRe = loader.render('code-review-re-review', {
      sprint: { sprint_id: sprintId, title: sprintTitle },
      task: { task_id: taskInfo.taskId, title: taskInfo.title },
      codeReview: { reviewId },
    });
    const buildRe = builders.buildCodeReviewReReviewPromptText(
      sprintId,
      sprintTitle,
      taskInfo,
      reviewId,
    );

    if (normalize(templRe) !== normalize(buildRe)) {
      console.error('Re-review template DOES NOT MATCH builder output');
      console.error('--- TEMPLATE ---');
      console.error(templRe);
      console.error('--- BUILDER ---');
      console.error(buildRe);
      process.exitCode = 1;
      return;
    }

    console.log('All code review templates match original builders.');
    process.exitCode = 0;
  } catch (err) {
    console.error('Error during verification:', err);
    process.exitCode = 1;
  }
}

run();
