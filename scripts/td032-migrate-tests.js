#!/usr/bin/env node
/**
 * TD-032 Test Migration Script
 *
 * Updates test files to use new schema:
 * - description → summary
 * - adds spec_task_refs when missing
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const testDir = path.join(rootDir, "test");

// Find all TypeScript test files
function findTestFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTestFiles(fullPath, files);
    } else if (entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

// Update content
function updateContent(content, filePath) {
  let updated = content;
  let changes = [];

  // Pattern 1: In task objects passed to handlers (configure_sprint, add_task input)
  // Change: description: "..." to summary: "..."
  // This matches: description: "Task description", description: 'Test', etc
  // But NOT: description: "File exists" (in verification checks)

  // We need to be careful - description is also used in:
  // - verification checks (structural_checks, behavioral_checks, quality_checks)
  // - file_operations
  // We only want to change task-level description

  // Pattern: Task objects in handler calls typically have: title, description, category
  // Let's match description fields that are followed by category or preceded by title

  // Simple approach: Replace specific known patterns
  const taskDescPatterns = [
    // Patterns where description is clearly a task description
    /(\btitle:.*?,\s*)description:\s*(["'][^"']*task[^"']*["'])/gi,
    /(\btitle:.*?,\s*)description:\s*(["']Test[^"']*["'])/gi,
    /(\btitle:.*?,\s*)description:\s*(["']A [^"']*["'])/gi,
    // description followed by category (clear task context)
    /(description:\s*["'][^"']*["'],\s*)(category:)/gi,
  ];

  // Actually, let's take a simpler approach:
  // In task objects, description is always at the task level alongside category
  // The pattern is: description: "...", followed by category: or preceded by title:

  // Match: description: "...", category:
  const regex1 = /description:\s*(["'][^"']*["']),(\s*\n?\s*)category:/g;
  if (regex1.test(updated)) {
    updated = updated.replace(
      regex1,
      'summary: $1,$2spec_task_refs: ["TD-032-test"],$2category:',
    );
    changes.push("Replaced task description with summary + spec_task_refs");
  }

  // Match objects with title then description (and add spec_task_refs if missing)
  const regex2 =
    /title:\s*(["'][^"']*["']),(\s*\n?\s*)description:\s*(["'][^"']*["']),/g;
  if (regex2.test(updated) && !updated.includes("spec_task_refs")) {
    // Need different approach for this
  }

  return { content: updated, changes };
}

// Main
console.log("TD-032 Test Migration Script");
console.log("============================\n");

const files = findTestFiles(testDir);
console.log(`Found ${files.length} test files\n`);

let totalChanges = 0;
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const { content: updated, changes } = updateContent(content, file);

  if (updated !== content) {
    const relPath = path.relative(rootDir, file);
    console.log(`Updated: ${relPath}`);
    changes.forEach((c) => console.log(`  - ${c}`));
    fs.writeFileSync(file, updated, "utf8");
    totalChanges++;
  }
}

console.log(`\nTotal files updated: ${totalChanges}`);
