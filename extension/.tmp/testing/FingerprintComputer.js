/**
 * FingerprintComputer - SHA-256 content hashing for change detection
 * Aligned with specs/013-test-runner-tools/data-model.md §4.2
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
/**
 * SHA-256 content hasher for source and test files.
 * Produces deterministic fingerprints by sorting file paths and hashing
 * both paths and file contents.
 */
export class FingerprintComputer {
    /**
     * Compute SHA-256 fingerprint for a set of files.
     * Files are sorted alphabetically for deterministic output.
     * Missing or unreadable files are skipped gracefully.
     *
     * @param filePaths Array of file paths to fingerprint
     * @returns FingerprintResult with hash, count, and included file list
     */
    async compute(filePaths) {
        // Sort paths for deterministic ordering
        const sortedPaths = [...filePaths].sort();
        const hash = createHash("sha256");
        const includedFiles = [];
        // Feed sorted path + content pairs into hash
        for (const filePath of sortedPaths) {
            try {
                const content = await readFile(filePath, "utf-8");
                // Hash both path and content to detect both file changes and renames
                hash.update(filePath);
                hash.update(content);
                includedFiles.push(filePath);
            }
            catch {
                // Skip files that don't exist or can't be read
                // This is expected behavior - don't fail the entire fingerprint
            }
        }
        return {
            hash: hash.digest("hex"),
            fileCount: includedFiles.length,
            files: includedFiles,
        };
    }
}
