/**
 * Orchestra Core - Public API
 *
 * Aligned with Orchestra Bible v0.7.0
 * This module exports all core services for use by CLI, MCP, and Extension.
 */

// Error handling
export * from "./errors.js";

// Types and schemas
export * from "./types.js";

// YAML utilities
export * from "./yaml.js";

// Configuration
export * from "./config.js";

// Git operations
export * from "./git.js";

// Manifest management
export * from "./manifest.js";

// Progress tracking
export * from "./progress.js";

// Output formatting
export * as output from "./output.js";

// Validation
export * from "./validation.js";

// Templates
export * from "./templates.js";

// Closeout verification
export * from "./closeout.js";

// Prepare handover
export * from "./prepare.js";

// Signal verification (note: CheckResult conflicts with closeout.ts)
export {
  runAcceptSignal,
  type AcceptSignalOptions,
  type CheckResult as SignalCheckResult,
  type SignalReport,
} from "./signal.js";

// Verification (note: exports with "Verify" prefix to avoid conflicts)
export {
  runVerification,
  type AcceptSignalStatus,
  type VerificationOptions,
  type VerifyCheck,
  type VerifyCheckResult,
  type VerifyCheckType,
  type VerifyReport,
  type VerifyResult,
  type VerifySeverity,
} from "./verification.js";
