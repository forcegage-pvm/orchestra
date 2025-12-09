/**
 * Artifact Validator
 *
 * Validates that artifacts claimed in signal_completion actually exist
 * on the filesystem. This prevents implementors from claiming to have
 * created files that don't exist.
 *
 * Per GAP-01: Pre-signal checks should validate artifact paths exist.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Artifact from signal_completion input
 */
export interface Artifact {
  /** File path (absolute or relative to workspace) */
  path: string;
  /** Operation type: CREATE, UPDATE, or DELETE */
  type: "CREATE" | "UPDATE" | "DELETE";
  /** Description of the artifact */
  description: string;
}

/**
 * Validation result for a single artifact
 */
export interface ArtifactValidationDetail {
  /** The artifact path */
  path: string;
  /** Operation type */
  type: "CREATE" | "UPDATE" | "DELETE";
  /** Whether the artifact passed validation */
  valid: boolean;
  /** Whether validation was skipped (e.g., for DELETE) */
  skipped?: boolean;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Combined validation result for all artifacts
 */
export interface ArtifactValidationResult {
  /** Whether all artifacts are valid */
  allValid: boolean;
  /** Number of valid artifacts */
  validCount: number;
  /** Number of invalid artifacts */
  invalidCount: number;
  /** List of missing artifact paths */
  missing: string[];
  /** List of skipped artifact paths (e.g., DELETE operations) */
  skipped: string[];
  /** Detailed results for each artifact */
  details: ArtifactValidationDetail[];
}

/**
 * Validate that artifacts exist on the filesystem
 *
 * @param artifacts - List of artifacts to validate
 * @param workspacePath - Workspace root directory for resolving relative paths
 * @returns Validation result with details for each artifact
 *
 * @example
 * ```typescript
 * const result = await validateArtifacts([
 *   { path: "src/index.ts", type: "CREATE", description: "Main entry" },
 * ], "/path/to/workspace");
 *
 * if (!result.allValid) {
 *   console.error("Missing artifacts:", result.missing);
 * }
 * ```
 */
export async function validateArtifacts(
  artifacts: Artifact[],
  workspacePath: string
): Promise<ArtifactValidationResult> {
  const details: ArtifactValidationDetail[] = [];
  const missing: string[] = [];
  const skipped: string[] = [];
  let validCount = 0;
  let invalidCount = 0;

  for (const artifact of artifacts) {
    const detail = await validateSingleArtifact(artifact, workspacePath);
    details.push(detail);

    if (detail.skipped) {
      skipped.push(artifact.path);
    } else if (detail.valid) {
      validCount++;
    } else {
      invalidCount++;
      missing.push(artifact.path);
    }
  }

  return {
    allValid: invalidCount === 0,
    validCount,
    invalidCount,
    missing,
    skipped,
    details,
  };
}

/**
 * Validate a single artifact
 */
async function validateSingleArtifact(
  artifact: Artifact,
  workspacePath: string
): Promise<ArtifactValidationDetail> {
  // Skip validation for DELETE operations - file should NOT exist
  if (artifact.type === "DELETE") {
    return {
      path: artifact.path,
      type: artifact.type,
      valid: true,
      skipped: true,
    };
  }

  // Resolve path (handle both absolute and relative paths)
  const fullPath = path.isAbsolute(artifact.path)
    ? artifact.path
    : path.join(workspacePath, artifact.path);

  // Check if file/directory exists
  try {
    await fs.promises.access(fullPath, fs.constants.F_OK);
    return {
      path: artifact.path,
      type: artifact.type,
      valid: true,
    };
  } catch {
    return {
      path: artifact.path,
      type: artifact.type,
      valid: false,
      error: `File not found: ${fullPath}`,
    };
  }
}
