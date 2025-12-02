/**
 * Orchestra Status Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Shows current Orchestra status.
 */

import {
  findOrchestraRoot,
  getResolvedPaths,
  loadConfig,
} from "../core/config.js";
import { loadManifest } from "../core/manifest.js";
import { formatResult, formatStatus, OutputFormat } from "../core/output.js";
import { ScriptResult } from "../core/types.js";

export interface StatusOptions {
  json?: boolean;
  orchestraRoot?: string;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const format: OutputFormat = options.json ? "json" : "human";

  // Find Orchestra root
  const root = findOrchestraRoot(options.orchestraRoot || process.cwd());
  if (!root) {
    const result: ScriptResult = {
      success: false,
      message: "Not in an Orchestra project (.orchestra not found)",
      errors: ["ORCHESTRA_NOT_FOUND"],
    };
    console.log(formatResult(result, format));
    process.exit(1);
  }

  // Load config
  const config = loadConfig(root);
  const paths = getResolvedPaths(root, config);

  // Load manifest
  const manifestResult = loadManifest(paths.manifest);
  if (!manifestResult.success || !manifestResult.data) {
    console.log(formatResult(manifestResult, format));
    process.exit(1);
  }

  // Output status
  console.log(formatStatus(manifestResult.data, format));
}
