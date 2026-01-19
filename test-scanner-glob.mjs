import { glob } from "glob";

const workspaceRoot = process.cwd();

const testFilePatterns = ["test/**/*.test.ts"];

const ignorePatterns = ["**/node_modules/**", "**/test/**/tdd-*.test.ts"];

console.log("Testing glob with ignore patterns...");
console.log("Workspace:", workspaceRoot);
console.log("Ignore:", ignorePatterns);
console.log("");

for (const pattern of testFilePatterns) {
  console.log("Pattern:", pattern);
  const matches = await glob(pattern, {
    cwd: workspaceRoot,
    absolute: false,
    ignore: ignorePatterns,
  });

  // Check for tdd-marker-scanner specifically
  const scannerFile = matches.filter((f) => f.includes("tdd-marker-scanner"));
  console.log("tdd-marker-scanner found (should be ZERO):", scannerFile.length);
  if (scannerFile.length > 0) {
    console.log("PROBLEM:");
    scannerFile.forEach((f) => console.log("  ", f));
  }

  const tddFiles = matches.filter((f) => /tdd-[^/\\]+\.test\.ts$/.test(f));
  console.log("tdd-*.test.ts files found (should be ZERO):", tddFiles.length);
  if (tddFiles.length > 0) {
    console.log("PROBLEM - these should be excluded:");
    tddFiles.forEach((f) => console.log("  ", f));
  }
  console.log("Total matches:", matches.length);
}
