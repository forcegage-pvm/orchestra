/**
 * Practical Implementation Examples for Improved File Editing Tools
 * 
 * These are ready-to-adapt patterns that can be integrated into custom agent tooling.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// TOOL 1: Smart Replace with Fuzzy Matching
// ============================================================================

interface SmartReplaceParams {
  filePath: string;
  oldText: string;
  newText: string;
  startLineHint?: number;
  occurrence?: number;        // 1-indexed, which occurrence to replace
  fuzzyThreshold?: number;    // 0.0-1.0, default 0.85
  dryRun?: boolean;
}

interface SmartReplaceResult {
  success: boolean;
  matchType: 'exact' | 'whitespace_normalized' | 'fuzzy' | 'not_found';
  matchLine?: number;
  similarityScore?: number;
  diffPreview?: string;
  error?: string;
  suggestion?: string;
}

/**
 * Levenshtein distance implementation
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Calculate similarity ratio (0.0 to 1.0)
 */
function similarityRatio(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

/**
 * Normalize whitespace for comparison
 */
function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map(line => line.trimEnd())  // Remove trailing whitespace
    .join('\n')
    .replace(/\t/g, '    ');      // Normalize tabs to 4 spaces
}

/**
 * Find all occurrences of a substring
 */
function findAllOccurrences(content: string, search: string): number[] {
  const indices: number[] = [];
  let index = content.indexOf(search);
  while (index !== -1) {
    indices.push(index);
    index = content.indexOf(search, index + 1);
  }
  return indices;
}

/**
 * Get line number from character index
 */
function getLineNumber(content: string, charIndex: number): number {
  return content.substring(0, charIndex).split('\n').length;
}

/**
 * Middle-out fuzzy search starting from a hint line
 */
function fuzzySearchMiddleOut(
  lines: string[],
  searchLines: string[],
  startHint: number,
  threshold: number
): { lineIndex: number; similarity: number } | null {
  const searchText = searchLines.join('\n');
  const searchLen = searchLines.length;
  const bufferSize = 50; // Search within 50 lines of hint
  
  const minLine = Math.max(0, startHint - bufferSize);
  const maxLine = Math.min(lines.length - searchLen, startHint + bufferSize);
  
  let bestMatch: { lineIndex: number; similarity: number } | null = null;
  
  // Middle-out search: start from hint, alternate up/down
  for (let offset = 0; offset <= bufferSize; offset++) {
    for (const direction of [0, -1, 1]) {
      if (offset === 0 && direction !== 0) continue;
      
      const lineIndex = startHint + (offset * direction);
      if (lineIndex < minLine || lineIndex > maxLine) continue;
      
      const candidateLines = lines.slice(lineIndex, lineIndex + searchLen);
      const candidateText = candidateLines.join('\n');
      const similarity = similarityRatio(
        normalizeWhitespace(searchText),
        normalizeWhitespace(candidateText)
      );
      
      if (similarity >= threshold) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { lineIndex, similarity };
        }
      }
    }
    
    // Early exit if we found a very good match
    if (bestMatch && bestMatch.similarity > 0.95) break;
  }
  
  return bestMatch;
}

/**
 * Smart Replace Tool Implementation
 */
export async function smartReplace(params: SmartReplaceParams): Promise<SmartReplaceResult> {
  const {
    filePath,
    oldText,
    newText,
    startLineHint,
    occurrence = 1,
    fuzzyThreshold = 0.85,
    dryRun = false
  } = params;

  // Read file content
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return {
      success: false,
      matchType: 'not_found',
      error: `Cannot read file: ${filePath}`
    };
  }

  // Strategy 1: Exact match
  const exactOccurrences = findAllOccurrences(content, oldText);
  if (exactOccurrences.length > 0) {
    if (exactOccurrences.length === 1 || occurrence <= exactOccurrences.length) {
      const targetIndex = exactOccurrences[occurrence - 1];
      const matchLine = getLineNumber(content, targetIndex);
      
      if (!dryRun) {
        const newContent = content.substring(0, targetIndex) + 
                          newText + 
                          content.substring(targetIndex + oldText.length);
        fs.writeFileSync(filePath, newContent, 'utf-8');
      }
      
      return {
        success: true,
        matchType: 'exact',
        matchLine,
        similarityScore: 1.0,
        diffPreview: generateDiffPreview(oldText, newText, matchLine)
      };
    } else {
      return {
        success: false,
        matchType: 'exact',
        error: `Found ${exactOccurrences.length} occurrences, but requested occurrence #${occurrence}`,
        suggestion: `Specify occurrence=1 through ${exactOccurrences.length}, or use startLineHint to narrow search`
      };
    }
  }

  // Strategy 2: Whitespace-normalized match
  const normalizedOld = normalizeWhitespace(oldText);
  const normalizedContent = normalizeWhitespace(content);
  const normalizedOccurrences = findAllOccurrences(normalizedContent, normalizedOld);
  
  if (normalizedOccurrences.length > 0) {
    // Map back to original content position
    const targetNormalizedIndex = normalizedOccurrences[Math.min(occurrence - 1, normalizedOccurrences.length - 1)];
    const matchLine = getLineNumber(normalizedContent, targetNormalizedIndex);
    
    // Find actual line range in original
    const lines = content.split('\n');
    const searchLines = oldText.split('\n');
    const startLine = matchLine - 1; // 0-indexed
    
    if (!dryRun) {
      // Replace the matched lines
      const newLines = [
        ...lines.slice(0, startLine),
        ...newText.split('\n'),
        ...lines.slice(startLine + searchLines.length)
      ];
      fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
    }
    
    return {
      success: true,
      matchType: 'whitespace_normalized',
      matchLine,
      similarityScore: 1.0,
      diffPreview: generateDiffPreview(oldText, newText, matchLine),
      suggestion: 'Matched after normalizing whitespace (tabs→spaces, trailing whitespace removed)'
    };
  }

  // Strategy 3: Fuzzy match
  const lines = content.split('\n');
  const searchLines = oldText.split('\n');
  const hintLine = startLineHint ? startLineHint - 1 : Math.floor(lines.length / 2);
  
  const fuzzyResult = fuzzySearchMiddleOut(lines, searchLines, hintLine, fuzzyThreshold);
  
  if (fuzzyResult) {
    const { lineIndex, similarity } = fuzzyResult;
    const matchLine = lineIndex + 1; // 1-indexed
    
    if (!dryRun) {
      const newLines = [
        ...lines.slice(0, lineIndex),
        ...newText.split('\n'),
        ...lines.slice(lineIndex + searchLines.length)
      ];
      fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
    }
    
    return {
      success: true,
      matchType: 'fuzzy',
      matchLine,
      similarityScore: similarity,
      diffPreview: generateDiffPreview(
        lines.slice(lineIndex, lineIndex + searchLines.length).join('\n'),
        newText,
        matchLine
      ),
      suggestion: `Fuzzy match at ${Math.round(similarity * 100)}% similarity`
    };
  }

  // No match found
  return {
    success: false,
    matchType: 'not_found',
    error: 'No match found for search string',
    suggestion: startLineHint 
      ? `No match found near line ${startLineHint}. Try expanding search or lowering fuzzy_threshold.`
      : 'Try providing a start_line_hint to narrow the search area.'
  };
}

function generateDiffPreview(oldText: string, newText: string, startLine: number): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  
  let preview = `@@ -${startLine},${oldLines.length} +${startLine},${newLines.length} @@\n`;
  oldLines.forEach(line => preview += `- ${line}\n`);
  newLines.forEach(line => preview += `+ ${line}\n`);
  
  return preview;
}


// ============================================================================
// TOOL 2: Line-Based Editing
// ============================================================================

interface EditLinesParams {
  filePath: string;
  startLine: number;            // 1-indexed, inclusive
  endLine: number;              // 1-indexed, inclusive. -1 = end of file
  newContent: string;           // Replacement text (empty string = delete)
  preserveIndentation?: boolean;
  validateSyntax?: boolean;
}

interface EditLinesResult {
  success: boolean;
  linesRemoved: number;
  linesAdded: number;
  diffPreview: string;
  syntaxErrors?: string[];
  error?: string;
}

export async function editLines(params: EditLinesParams): Promise<EditLinesResult> {
  const {
    filePath,
    startLine,
    endLine,
    newContent,
    preserveIndentation = true,
    validateSyntax = false
  } = params;

  // Validate params
  if (startLine < 1) {
    return { success: false, linesRemoved: 0, linesAdded: 0, diffPreview: '', error: 'startLine must be >= 1' };
  }

  // Read file
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return { success: false, linesRemoved: 0, linesAdded: 0, diffPreview: '', error: `Cannot read file: ${filePath}` };
  }

  const lines = content.split('\n');
  const actualEndLine = endLine === -1 ? lines.length : endLine;
  
  if (startLine > lines.length) {
    return { success: false, linesRemoved: 0, linesAdded: 0, diffPreview: '', error: `startLine ${startLine} exceeds file length ${lines.length}` };
  }

  // Get the lines being replaced (for diff preview)
  const removedLines = lines.slice(startLine - 1, actualEndLine);
  const linesRemoved = removedLines.length;

  // Process new content
  let newLines = newContent.split('\n');
  
  // Preserve indentation if requested
  if (preserveIndentation && removedLines.length > 0) {
    const originalIndent = removedLines[0].match(/^(\s*)/)?.[1] || '';
    const newFirstLineIndent = newLines[0].match(/^(\s*)/)?.[1] || '';
    
    if (originalIndent !== newFirstLineIndent) {
      // Adjust all new lines to match original indentation
      const indentDiff = originalIndent.length - newFirstLineIndent.length;
      newLines = newLines.map(line => {
        if (indentDiff > 0) {
          return ' '.repeat(indentDiff) + line;
        } else {
          // Remove leading spaces if original had less indent
          const lineIndent = line.match(/^(\s*)/)?.[1] || '';
          const newIndent = Math.max(0, lineIndent.length + indentDiff);
          return ' '.repeat(newIndent) + line.trimStart();
        }
      });
    }
  }

  const linesAdded = newLines.filter(l => l !== '' || newLines.length === 1).length;

  // Build new file content
  const resultLines = [
    ...lines.slice(0, startLine - 1),
    ...newLines,
    ...lines.slice(actualEndLine)
  ];
  const newFileContent = resultLines.join('\n');

  // Syntax validation (if requested)
  if (validateSyntax) {
    const syntaxErrors = await validateFileSyntax(filePath, newFileContent);
    if (syntaxErrors.length > 0) {
      return {
        success: false,
        linesRemoved,
        linesAdded,
        diffPreview: generateDiffPreview(removedLines.join('\n'), newLines.join('\n'), startLine),
        syntaxErrors,
        error: 'Edit would introduce syntax errors. Changes not applied.'
      };
    }
  }

  // Write file
  fs.writeFileSync(filePath, newFileContent, 'utf-8');

  return {
    success: true,
    linesRemoved,
    linesAdded,
    diffPreview: generateDiffPreview(removedLines.join('\n'), newLines.join('\n'), startLine)
  };
}


// ============================================================================
// TOOL 3: Insert at Line
// ============================================================================

interface InsertAtLineParams {
  filePath: string;
  line: number;                 // Insert BEFORE this line (1-indexed). 0 = start of file
  content: string;
  autoIndent?: boolean;         // Match indentation of surrounding code
}

export async function insertAtLine(params: InsertAtLineParams): Promise<{ success: boolean; insertedAt: number; error?: string }> {
  const { filePath, line, content, autoIndent = true } = params;

  let fileContent: string;
  try {
    fileContent = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return { success: false, insertedAt: 0, error: `Cannot read file: ${filePath}` };
  }

  const lines = fileContent.split('\n');
  const insertIndex = Math.max(0, Math.min(line - 1, lines.length));
  
  let contentToInsert = content;
  
  // Auto-indent based on surrounding lines
  if (autoIndent) {
    const referenceLineIndex = Math.min(insertIndex, lines.length - 1);
    const referenceLine = lines[referenceLineIndex] || '';
    const referenceIndent = referenceLine.match(/^(\s*)/)?.[1] || '';
    
    // Apply reference indentation to all lines being inserted
    const insertLines = content.split('\n');
    const firstLineIndent = insertLines[0].match(/^(\s*)/)?.[1] || '';
    
    if (firstLineIndent !== referenceIndent) {
      contentToInsert = insertLines.map((l, i) => {
        if (i === 0) return referenceIndent + l.trimStart();
        // Preserve relative indentation for subsequent lines
        const currentIndent = l.match(/^(\s*)/)?.[1] || '';
        const relativeIndent = currentIndent.length - firstLineIndent.length;
        return referenceIndent + ' '.repeat(Math.max(0, relativeIndent)) + l.trimStart();
      }).join('\n');
    }
  }

  const newLines = [
    ...lines.slice(0, insertIndex),
    ...contentToInsert.split('\n'),
    ...lines.slice(insertIndex)
  ];

  fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');

  return { success: true, insertedAt: insertIndex + 1 };
}


// ============================================================================
// TOOL 4: Delete Section
// ============================================================================

interface DeleteSectionParams {
  filePath: string;
  // Line-based deletion
  startLine?: number;
  endLine?: number;
  // OR pattern-based deletion
  startPattern?: string;
  endPattern?: string;
  includePatternLines?: boolean;
}

export async function deleteSection(params: DeleteSectionParams): Promise<{
  success: boolean;
  linesDeleted: number;
  deletedContent: string;
  error?: string;
}> {
  const { filePath, startLine, endLine, startPattern, endPattern, includePatternLines = true } = params;

  let fileContent: string;
  try {
    fileContent = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return { success: false, linesDeleted: 0, deletedContent: '', error: `Cannot read file: ${filePath}` };
  }

  const lines = fileContent.split('\n');
  let start: number;
  let end: number;

  if (startLine !== undefined && endLine !== undefined) {
    // Line-based deletion
    start = startLine - 1;
    end = endLine === -1 ? lines.length - 1 : endLine - 1;
  } else if (startPattern && endPattern) {
    // Pattern-based deletion
    start = lines.findIndex(l => l.includes(startPattern));
    if (start === -1) {
      return { success: false, linesDeleted: 0, deletedContent: '', error: `Start pattern not found: ${startPattern}` };
    }
    
    end = lines.findIndex((l, i) => i > start && l.includes(endPattern));
    if (end === -1) {
      return { success: false, linesDeleted: 0, deletedContent: '', error: `End pattern not found after start: ${endPattern}` };
    }
    
    if (!includePatternLines) {
      start++;
      end--;
    }
  } else {
    return { success: false, linesDeleted: 0, deletedContent: '', error: 'Must specify either startLine/endLine or startPattern/endPattern' };
  }

  if (start < 0 || end >= lines.length || start > end) {
    return { success: false, linesDeleted: 0, deletedContent: '', error: `Invalid line range: ${start + 1} to ${end + 1}` };
  }

  const deletedLines = lines.slice(start, end + 1);
  const newLines = [...lines.slice(0, start), ...lines.slice(end + 1)];

  fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');

  return {
    success: true,
    linesDeleted: deletedLines.length,
    deletedContent: deletedLines.join('\n')
  };
}


// ============================================================================
// TOOL 5: Validate Edit (Syntax Check)
// ============================================================================

interface ValidateEditParams {
  filePath: string;
  newContent: string;
}

interface SyntaxError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

async function validateFileSyntax(filePath: string, content: string): Promise<string[]> {
  const ext = path.extname(filePath).toLowerCase();
  const errors: string[] = [];

  // Python syntax check
  if (ext === '.py') {
    try {
      // Write to temp file and run Python syntax check
      const tempFile = `/tmp/validate_${Date.now()}.py`;
      fs.writeFileSync(tempFile, content);
      
      const { execSync } = require('child_process');
      try {
        execSync(`python3 -m py_compile "${tempFile}"`, { encoding: 'utf-8', stdio: 'pipe' });
      } catch (e: any) {
        errors.push(e.stderr || e.message);
      }
      
      fs.unlinkSync(tempFile);
    } catch (e) {
      // Ignore validation errors
    }
  }

  // JavaScript/TypeScript syntax check
  if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
    try {
      // Use esprima or TypeScript compiler for validation
      // This is a simplified example
      const tempFile = `/tmp/validate_${Date.now()}${ext}`;
      fs.writeFileSync(tempFile, content);
      
      const { execSync } = require('child_process');
      try {
        if (ext.includes('ts')) {
          execSync(`npx tsc --noEmit "${tempFile}"`, { encoding: 'utf-8', stdio: 'pipe' });
        } else {
          execSync(`node --check "${tempFile}"`, { encoding: 'utf-8', stdio: 'pipe' });
        }
      } catch (e: any) {
        errors.push(e.stderr || e.message);
      }
      
      fs.unlinkSync(tempFile);
    } catch (e) {
      // Ignore validation errors
    }
  }

  // JSON syntax check
  if (ext === '.json') {
    try {
      JSON.parse(content);
    } catch (e: any) {
      errors.push(`JSON parse error: ${e.message}`);
    }
  }

  return errors;
}

export async function validateEdit(params: ValidateEditParams): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors = await validateFileSyntax(params.filePath, params.newContent);
  
  return {
    valid: errors.length === 0,
    errors: errors.filter(e => !e.toLowerCase().includes('warning')),
    warnings: errors.filter(e => e.toLowerCase().includes('warning'))
  };
}


// ============================================================================
// TOOL 6: Bulk Replace
// ============================================================================

interface BulkReplaceParams {
  pathPattern: string;          // File path or glob pattern
  find: string;
  replace: string;
  isRegex?: boolean;
  wholeWord?: boolean;
  caseSensitive?: boolean;
  dryRun?: boolean;
}

interface FileChange {
  filePath: string;
  replacements: number;
  preview: string;              // First few replacements as preview
}

export async function bulkReplace(params: BulkReplaceParams): Promise<{
  success: boolean;
  filesModified: number;
  totalReplacements: number;
  changes: FileChange[];
}> {
  const {
    pathPattern,
    find,
    replace,
    isRegex = false,
    wholeWord = false,
    caseSensitive = true,
    dryRun = false
  } = params;

  // For simplicity, handle single file path (extend with glob matching for production)
  const files = [pathPattern]; // In production: glob.sync(pathPattern)
  
  let pattern: RegExp;
  if (isRegex) {
    pattern = new RegExp(find, caseSensitive ? 'g' : 'gi');
  } else {
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patternStr = wholeWord ? `\\b${escaped}\\b` : escaped;
    pattern = new RegExp(patternStr, caseSensitive ? 'g' : 'gi');
  }

  const changes: FileChange[] = [];
  let totalReplacements = 0;

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.match(pattern);
    
    if (!matches || matches.length === 0) continue;

    const newContent = content.replace(pattern, replace);
    const replacements = matches.length;
    totalReplacements += replacements;

    // Generate preview (first 3 changes)
    const previewLines: string[] = [];
    const lines = content.split('\n');
    let found = 0;
    for (let i = 0; i < lines.length && found < 3; i++) {
      if (pattern.test(lines[i])) {
        previewLines.push(`Line ${i + 1}: "${lines[i].trim()}" → "${lines[i].replace(pattern, replace).trim()}"`);
        found++;
      }
      pattern.lastIndex = 0; // Reset regex state
    }

    if (!dryRun) {
      fs.writeFileSync(filePath, newContent, 'utf-8');
    }

    changes.push({
      filePath,
      replacements,
      preview: previewLines.join('\n')
    });
  }

  return {
    success: true,
    filesModified: changes.length,
    totalReplacements,
    changes
  };
}


// ============================================================================
// TOOL 7: Move File with Import Updates
// ============================================================================

interface MoveFileParams {
  sourcePath: string;
  destPath: string;
  updateImports?: boolean;
  dryRun?: boolean;
}

interface MoveFileResult {
  success: boolean;
  importsUpdated: number;
  filesModified: string[];
  error?: string;
  preview?: string;
}

/**
 * Find all files that import a given module
 */
function findImporters(targetPath: string, searchRoot: string): { file: string; line: number; importStatement: string }[] {
  const importers: { file: string; line: number; importStatement: string }[] = [];
  
  // Get file extension to determine import syntax
  const ext = path.extname(targetPath);
  const isTypeScript = ['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext);
  const isPython = ext === '.py';
  
  // Walk directory and find imports
  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Skip node_modules, .git, etc.
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv'].includes(entry.name)) {
          walkDir(fullPath);
        }
        continue;
      }
      
      // Only check relevant file types
      const fileExt = path.extname(entry.name);
      if (isTypeScript && !['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(fileExt)) continue;
      if (isPython && fileExt !== '.py') continue;
      
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      
      // Calculate what the import path would look like from this file
      const relativePath = path.relative(path.dirname(fullPath), targetPath);
      const importPath = normalizeImportPath(relativePath, ext);
      
      lines.forEach((line, idx) => {
        // TypeScript/JavaScript imports
        if (isTypeScript) {
          // Match: import ... from 'path' or require('path')
          const importMatch = line.match(/(?:import|export).*from\s+['"]([^'"]+)['"]/);
          const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
          
          const matchedPath = importMatch?.[1] || requireMatch?.[1];
          if (matchedPath && matchPathsEqual(matchedPath, importPath, path.dirname(fullPath), targetPath)) {
            importers.push({ file: fullPath, line: idx + 1, importStatement: line.trim() });
          }
        }
        
        // Python imports
        if (isPython) {
          // Match: from module import ... or import module
          const fromMatch = line.match(/from\s+([.\w]+)\s+import/);
          const importMatch = line.match(/^import\s+([.\w]+)/);
          
          const matchedModule = fromMatch?.[1] || importMatch?.[1];
          if (matchedModule && matchPythonModule(matchedModule, targetPath, fullPath, searchRoot)) {
            importers.push({ file: fullPath, line: idx + 1, importStatement: line.trim() });
          }
        }
      });
    }
  }
  
  walkDir(searchRoot);
  return importers;
}

function normalizeImportPath(relativePath: string, ext: string): string {
  // Remove extension for JS/TS imports
  let normalized = relativePath.replace(/\\/g, '/');
  
  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    normalized = normalized.replace(/\.(ts|tsx|js|jsx)$/, '');
  }
  
  // Ensure relative paths start with ./
  if (!normalized.startsWith('.') && !normalized.startsWith('/')) {
    normalized = './' + normalized;
  }
  
  return normalized;
}

function matchPathsEqual(importPath: string, expectedPath: string, fromDir: string, targetFile: string): boolean {
  // Resolve both to absolute and compare
  const resolvedImport = path.resolve(fromDir, importPath);
  const resolvedTarget = targetFile.replace(/\.(ts|tsx|js|jsx)$/, '');
  
  return resolvedImport === resolvedTarget || 
         resolvedImport === targetFile ||
         resolvedImport + '.ts' === targetFile ||
         resolvedImport + '.js' === targetFile ||
         resolvedImport + '/index' === resolvedTarget;
}

function matchPythonModule(modulePath: string, targetFile: string, fromFile: string, root: string): boolean {
  // Convert Python module path to file path
  const moduleParts = modulePath.split('.');
  const possiblePaths = [
    path.join(root, ...moduleParts) + '.py',
    path.join(root, ...moduleParts, '__init__.py'),
    path.join(path.dirname(fromFile), ...moduleParts) + '.py',
  ];
  
  return possiblePaths.includes(targetFile);
}

export async function moveFile(params: MoveFileParams): Promise<MoveFileResult> {
  const { sourcePath, destPath, updateImports = true, dryRun = false } = params;
  
  // Validate source exists
  if (!fs.existsSync(sourcePath)) {
    return { success: false, importsUpdated: 0, filesModified: [], error: `Source file not found: ${sourcePath}` };
  }
  
  // Validate destination doesn't exist
  if (fs.existsSync(destPath)) {
    return { success: false, importsUpdated: 0, filesModified: [], error: `Destination already exists: ${destPath}` };
  }
  
  const filesModified: string[] = [];
  let importsUpdated = 0;
  let preview = '';
  
  if (updateImports) {
    // Find the project root (look for package.json, pyproject.toml, etc.)
    let searchRoot = path.dirname(sourcePath);
    while (searchRoot !== path.dirname(searchRoot)) {
      if (fs.existsSync(path.join(searchRoot, 'package.json')) ||
          fs.existsSync(path.join(searchRoot, 'pyproject.toml')) ||
          fs.existsSync(path.join(searchRoot, '.git'))) {
        break;
      }
      searchRoot = path.dirname(searchRoot);
    }
    
    // Find all files importing this module
    const importers = findImporters(sourcePath, searchRoot);
    
    // Calculate import updates
    for (const importer of importers) {
      const oldRelative = normalizeImportPath(
        path.relative(path.dirname(importer.file), sourcePath),
        path.extname(sourcePath)
      );
      const newRelative = normalizeImportPath(
        path.relative(path.dirname(importer.file), destPath),
        path.extname(destPath)
      );
      
      if (oldRelative !== newRelative) {
        preview += `${importer.file}:${importer.line}\n`;
        preview += `  - ${importer.importStatement}\n`;
        preview += `  + ${importer.importStatement.replace(oldRelative, newRelative)}\n\n`;
        
        if (!dryRun) {
          // Update the import
          const content = fs.readFileSync(importer.file, 'utf-8');
          const updatedContent = content.replace(oldRelative, newRelative);
          fs.writeFileSync(importer.file, updatedContent, 'utf-8');
          filesModified.push(importer.file);
        }
        
        importsUpdated++;
      }
    }
  }
  
  if (dryRun) {
    return {
      success: true,
      importsUpdated,
      filesModified: [],
      preview: preview || 'No import updates needed.\n' + `Would move: ${sourcePath} → ${destPath}`
    };
  }
  
  // Create destination directory if needed
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  // Move the file
  fs.renameSync(sourcePath, destPath);
  
  return {
    success: true,
    importsUpdated,
    filesModified
  };
}


// ============================================================================
// TOOL 8: Copy File
// ============================================================================

interface CopyFileParams {
  sourcePath: string;
  destPath: string;
  adjustRelativeImports?: boolean;  // Fix imports INSIDE the copied file
}

export async function copyFile(params: CopyFileParams): Promise<{
  success: boolean;
  importsAdjusted: number;
  error?: string;
}> {
  const { sourcePath, destPath, adjustRelativeImports = true } = params;
  
  if (!fs.existsSync(sourcePath)) {
    return { success: false, importsAdjusted: 0, error: `Source file not found: ${sourcePath}` };
  }
  
  if (fs.existsSync(destPath)) {
    return { success: false, importsAdjusted: 0, error: `Destination already exists: ${destPath}` };
  }
  
  // Create destination directory if needed
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  let content = fs.readFileSync(sourcePath, 'utf-8');
  let importsAdjusted = 0;
  
  if (adjustRelativeImports) {
    // Adjust relative imports inside the file
    const ext = path.extname(sourcePath);
    const isTypeScript = ['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext);
    
    if (isTypeScript) {
      // Find and adjust relative imports
      const importRegex = /(import|export)(\s+.*?\s+from\s+)(['"])(\.[^'"]+)(['"])/g;
      
      content = content.replace(importRegex, (match, keyword, middle, quote1, importPath, quote2) => {
        // Calculate the absolute path of what's being imported
        const absoluteImport = path.resolve(path.dirname(sourcePath), importPath);
        
        // Calculate new relative path from destination
        let newRelative = path.relative(path.dirname(destPath), absoluteImport);
        newRelative = newRelative.replace(/\\/g, '/');
        if (!newRelative.startsWith('.')) {
          newRelative = './' + newRelative;
        }
        
        if (newRelative !== importPath) {
          importsAdjusted++;
          return `${keyword}${middle}${quote1}${newRelative}${quote2}`;
        }
        return match;
      });
    }
  }
  
  fs.writeFileSync(destPath, content, 'utf-8');
  
  return { success: true, importsAdjusted };
}


// ============================================================================
// TOOL 9: Find Importers (Dependency Analysis)
// ============================================================================

interface FindImportersParams {
  filePath: string;
  searchRoot?: string;
}

export async function findImportersForFile(params: FindImportersParams): Promise<{
  importers: { file: string; line: number; importStatement: string }[];
  totalCount: number;
}> {
  let searchRoot = params.searchRoot;
  
  if (!searchRoot) {
    // Find project root
    searchRoot = path.dirname(params.filePath);
    while (searchRoot !== path.dirname(searchRoot)) {
      if (fs.existsSync(path.join(searchRoot, 'package.json')) ||
          fs.existsSync(path.join(searchRoot, 'pyproject.toml')) ||
          fs.existsSync(path.join(searchRoot, '.git'))) {
        break;
      }
      searchRoot = path.dirname(searchRoot);
    }
  }
  
  const importers = findImporters(params.filePath, searchRoot);
  
  return {
    importers,
    totalCount: importers.length
  };
}


// ============================================================================
// Export Tool Definitions (for MCP or VS Code extension)
// ============================================================================

export const toolDefinitions = {
  smart_replace: {
    name: 'smart_replace',
    description: `Replace text in a file with fuzzy matching support. 
    Tries exact match first, then whitespace-normalized match, then fuzzy match.
    Use start_line_hint to guide search when file is large.
    Use occurrence to specify which match when multiple exist.`,
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file' },
        old_text: { type: 'string', description: 'Text to find and replace' },
        new_text: { type: 'string', description: 'Replacement text' },
        start_line_hint: { type: 'number', description: 'Approximate line number where text should be found' },
        occurrence: { type: 'number', description: 'Which occurrence to replace (1-indexed), default 1' },
        fuzzy_threshold: { type: 'number', description: 'Minimum similarity for fuzzy match (0.0-1.0), default 0.85' },
        dry_run: { type: 'boolean', description: 'Preview changes without applying' }
      },
      required: ['file_path', 'old_text', 'new_text']
    }
  },

  edit_lines: {
    name: 'edit_lines',
    description: `Edit specific line range in a file. Bypasses string matching - use when you know exact line numbers.
    Set new_content to empty string to delete lines.
    Use -1 for end_line to edit to end of file.`,
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file' },
        start_line: { type: 'number', description: 'First line to edit (1-indexed)' },
        end_line: { type: 'number', description: 'Last line to edit (inclusive), or -1 for end of file' },
        new_content: { type: 'string', description: 'Replacement text (empty to delete)' },
        preserve_indentation: { type: 'boolean', description: 'Auto-match surrounding indentation, default true' },
        validate_syntax: { type: 'boolean', description: 'Check syntax before applying, default false' }
      },
      required: ['file_path', 'start_line', 'end_line', 'new_content']
    }
  },

  insert_at_line: {
    name: 'insert_at_line',
    description: `Insert new content before a specific line. Use for adding imports, new functions, etc.
    Line 1 = insert at very beginning, line N+1 = append to end of N-line file.`,
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file' },
        line: { type: 'number', description: 'Insert BEFORE this line (1-indexed)' },
        content: { type: 'string', description: 'Content to insert' },
        auto_indent: { type: 'boolean', description: 'Match indentation of surrounding code, default true' }
      },
      required: ['file_path', 'line', 'content']
    }
  },

  delete_section: {
    name: 'delete_section',
    description: `Delete a section of a file by line numbers or pattern markers.
    For pattern-based deletion, finds first occurrence of start_pattern, then first end_pattern after that.`,
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file' },
        start_line: { type: 'number', description: 'First line to delete (1-indexed)' },
        end_line: { type: 'number', description: 'Last line to delete (inclusive)' },
        start_pattern: { type: 'string', description: 'Delete from line containing this pattern' },
        end_pattern: { type: 'string', description: 'Delete to line containing this pattern' },
        include_pattern_lines: { type: 'boolean', description: 'Include the pattern lines in deletion, default true' }
      },
      required: ['file_path']
    }
  },

  bulk_replace: {
    name: 'bulk_replace',
    description: `Replace all occurrences of a pattern across file(s). Good for refactoring (variable renames, API updates).`,
    parameters: {
      type: 'object',
      properties: {
        path_pattern: { type: 'string', description: 'File path or glob pattern' },
        find: { type: 'string', description: 'Text or regex to find' },
        replace: { type: 'string', description: 'Replacement text' },
        is_regex: { type: 'boolean', description: 'Treat find as regex, default false' },
        whole_word: { type: 'boolean', description: 'Match whole words only, default false' },
        case_sensitive: { type: 'boolean', description: 'Case sensitive matching, default true' },
        dry_run: { type: 'boolean', description: 'Preview without applying, default false' }
      },
      required: ['path_pattern', 'find', 'replace']
    }
  },

  move_file: {
    name: 'move_file',
    description: `Move/rename a file and optionally update all imports across the codebase.
    Finds all files that import the moved file and updates their import paths.
    Creates destination directories automatically.
    Use dry_run=true to preview changes before applying.`,
    parameters: {
      type: 'object',
      properties: {
        source_path: { type: 'string', description: 'Current path of the file' },
        dest_path: { type: 'string', description: 'New path for the file' },
        update_imports: { type: 'boolean', description: 'Update imports in other files, default true' },
        dry_run: { type: 'boolean', description: 'Preview changes without applying, default false' }
      },
      required: ['source_path', 'dest_path']
    }
  },

  copy_file: {
    name: 'copy_file',
    description: `Copy a file to a new location. Optionally adjusts relative imports INSIDE the copied file
    to account for the new location. Does NOT update imports in other files (use for templates, duplicating code).`,
    parameters: {
      type: 'object',
      properties: {
        source_path: { type: 'string', description: 'Path of file to copy' },
        dest_path: { type: 'string', description: 'Destination path' },
        adjust_relative_imports: { type: 'boolean', description: 'Fix relative imports inside copied file, default true' }
      },
      required: ['source_path', 'dest_path']
    }
  },

  find_importers: {
    name: 'find_importers',
    description: `Find all files that import a given module. Useful for understanding the impact
    before moving/renaming a file, or for refactoring.`,
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file being imported' },
        search_root: { type: 'string', description: 'Root directory to search (default: auto-detect project root)' }
      },
      required: ['file_path']
    }
  }
};
