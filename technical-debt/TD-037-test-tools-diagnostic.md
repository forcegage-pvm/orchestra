# Test Tools Failure Diagnosis - Debug Logging

## Reported Issues (Screenshots)

### Issue 1: JSON output file not found

```
run_tests({ scope: "suite", target: "smoke" })
❌ ERROR: JSON output file not found: C:\Users\Marius\AppData\Local\Temp\vitest-output-1770832251819-f4d8i8.json
```

**Symptom:** Vitest process never creates the JSON output file.

**Possible causes:**

- Vitest fails before writing output (config error, spawn error)
- Wrong working directory (can't find vitest.config.ts)
- Vitest not installed in the project
- Path resolution issue

### Issue 2: Zero tests found

```
run_tests({ scope: "file", target: "test/smoke/string-utils-exports.test.ts" })
✓ PASS | 0 passed, 0 failed, 0 skipped | 0.0s
```

**Symptom:** Vitest runs successfully but finds NO tests.

**Possible causes:**

- Wrong working directory (test file path doesn't resolve)
- Test file doesn't match vitest config patterns
- Import errors prevent test discovery
- Vitest config excludes the test file

## Root Cause Analysis

The VitestRunner had critical debugging gaps:

### Problem 1: stdout/stderr Not Captured

```typescript
// OLD CODE - stdio piped but never read
const child = spawn("npx", args, {
  cwd,
  stdio: ["ignore", "pipe", "pipe"], // ⚠️ Piped but never consumed
});

child.on("exit", (code) => {
  resolve(code ?? 1); // ❌ No error output available
});
```

**Impact:**

- Child process can hang if stdout/stderr buffers fill
- Error messages from vitest are lost
- Impossible to debug why vitest failed
- No visibility into config/path issues

### Problem 2: No Command Visibility

No logging of what command is actually being executed or where.

**Impact:**

- Can't verify working directory is correct
- Can't see actual command arguments
- Can't reproduce issue manually
- Can't verify config file is found

## Solution: Debug Logging + stderr Capture

### 1. Capture stdout/stderr

```typescript
// NEW CODE - capture output
const stdoutChunks: Buffer[] = [];
const stderrChunks: Buffer[] = [];

child.stdout?.on("data", (chunk: Buffer) => {
  stdoutChunks.push(chunk);
});

child.stderr?.on("data", (chunk: Buffer) => {
  stderrChunks.push(chunk);
});

child.on("exit", (code) => {
  const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
  const stderr = Buffer.concat(stderrChunks).toString("utf-8");
  resolve({ exitCode, stdout, stderr }); // ✅ All output available
});
```

### 2. Log Command Execution

```typescript
// NEW CODE - debug visibility
console.log(
  `[VitestRunner] Executing: npx ${args.join(" ")}\n  cwd: ${options.workingDir}`,
);
```

### 3. Include stderr in Errors

```typescript
// NEW CODE - error context
try {
  vitestJson = await this.readJsonOutput(outputFile);
} catch (error) {
  if (error.message.includes("JSON output file not found")) {
    const stderrPreview = stderr ? `\n\nStderr:\n${stderr.slice(0, 500)}` : "";
    throw new Error(`${error.message}${stderrPreview}`); // ✅ stderr included
  }
}
```

## How to Diagnose (Updated Process)

### Step 1: Open DevTools Console

1. `Ctrl + Shift + P` → `Developer: Toggle Developer Tools`
2. Go to **Console** tab
3. Filter for `[VitestRunner]` logs

### Step 2: Run Test Tool

From Agent Panel or via tool call:

```typescript
run_tests({ scope: "suite", target: "smoke" });
// or
run_tests({ scope: "file", target: "test/smoke/string-utils-exports.test.ts" });
```

### Step 3: Examine Console Output

**Expected debug logs:**

```
[VitestRunner] Executing: npx vitest run --reporter=json --outputFile=C:\Users\...\vitest-output-123.json test/smoke/**/*.test.ts
  cwd: X:\repositories\orchestra-dev
```

**If stderr appears:**

```
[VitestRunner] stderr:
ENOENT: no such file or directory, open 'X:\repositories\orchestra-dev\vitest.config.ts'
```

### Step 4: Verify Key Information

From the logs, check:

✅ **Working directory correct?**

- Should be: `X:\repositories\orchestra-dev` (root project)
- NOT: `X:\repositories\orchestra-dev\extension`

✅ **Config file found?**

- Should find: `vitest.config.ts` in cwd
- stderr should NOT show ENOENT for config

✅ **Test paths valid?**

- For suite: `test/smoke/**/*.test.ts` should match existing files
- For file: `test/smoke/string-utils-exports.test.ts` should exist

✅ **Vitest installed?**

- `npx vitest` should resolve to `node_modules/.bin/vitest`
- stderr should NOT show "command not found"

## Common Issues and Solutions

### Issue: Wrong Working Directory

**Symptom:**

```
cwd: X:\repositories\orchestra-dev\extension
[VitestRunner] stderr:
ENOENT: no such file or directory, open '.../vitest.config.ts'
```

**Cause:** Workspace root is extension folder, not project root.

**Solution:**

- Close extension workspace folder in VS Code
- Open repository root folder instead
- Or use `working_dir` parameter in tool call

### Issue: Config File Not Found

**Symptom:**

```
[VitestRunner] stderr:
Could not find config file
```

**Cause:** vitest.config.ts doesn't exist or is in wrong location.

**Solution:**

- Verify `vitest.config.ts` exists in working directory
- Check `.agent-test-config.json` configFingerprint patterns
- Ensure config file name matches vitest expectations

### Issue: Test Files Not Found (0 tests)

**Symptom:**

```
PASS | 0 passed, 0 failed, 0 skipped | 0.0s
```

**Cause:** Test file paths don't resolve from working directory.

**Solution:**

- Check test file exists: `test/smoke/string-utils-exports.test.ts`
- Verify path is relative to working directory
- Check vitest config doesn't exclude the test file
- Examine vitest config `include`/`exclude` patterns

### Issue: Import Errors Prevent Discovery

**Symptom:**

```
[VitestRunner] stderr:
Cannot find module '../../src/core/string-utils.js'
```

**Cause:** Test file imports are broken, vitest skips file.

**Solution:**

- Verify imports resolve from test file location
- Check build artifacts exist (test imports from `dist/` or `src/`)
- Run build if imports expect compiled output
- Verify TypeScript paths config matches vitest config

## Testing the Fix

### Manual Test

```bash
# In repository root
cd X:\repositories\orchestra-dev

# Run vitest manually with same args tool would use
npx vitest run --reporter=json --outputFile=C:\Temp\test-output.json test/smoke/**/*.test.ts

# Check output file created
cat C:\Temp\test-output.json

# Check for errors
echo $?  # Should be 0 for success
```

### Via Tool (After Reload)

1. **Reload Extension:** `Developer: Reload Window`
2. **Launch Agent:** Play button on task
3. **Use run_tests:** `run_tests({ scope: "smoke" })`
4. **Check Console:** Look for `[VitestRunner]` logs
5. **Examine stderr:** If present, shows error cause
6. **Verify result:** Should see test counts or specific errors

## Files Changed

- `extension/src/agents/tools/testing/VitestRunner.ts`
  - Add stdout/stderr capture to spawnProcess()
  - Add console.log debug output
  - Include stderr in VitestRunResult
  - Append stderr to "JSON output file not found" errors

## Related Issues

- TD-035: System prompt template deployment
- TD-036: System prompt verification (DevTools logging)
- test-tools-001 sprint: Agent testing workflow

## Next Steps

1. **Reload extension** with new build
2. **Retry test tools** from screenshots
3. **Share console output** showing:
   - [VitestRunner] Executing command + cwd
   - Any stderr output
   - Actual error cause
4. **Fix root issue** based on diagnostics:
   - Workspace folder configuration
   - Missing dependencies
   - Config file issues
   - Import resolution

The debug logs will show EXACTLY why tests are failing!
