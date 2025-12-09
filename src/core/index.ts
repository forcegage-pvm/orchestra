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

// Git behavior defaults registry
export * from "./git-defaults.js";

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

// Template Converter (HBS → YAML/MD)
export * from "./template-converter.js";

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

// Feedback generation
export {
  runFeedback,
  type FeedbackIssue,
  type FeedbackOptions,
  type FeedbackResult,
} from "./feedback.js";

// Verification (note: exports with "Verify" prefix to avoid conflicts)
export {
  VERIFICATION_CHECK_TYPES,
  VERIFICATION_SEVERITIES,
  VerificationCheckSchema,
  VerificationYamlSchema,
  formatVerificationErrors,
  runVerification,
  validateVerificationYaml,
  type AcceptSignalStatus,
  type VerificationCheck,
  type VerificationOptions,
  type VerificationValidationError,
  type VerificationValidationResult,
  type VerificationYaml,
  type VerifyCheck,
  type VerifyCheckResult,
  type VerifyCheckType,
  type VerifyReport,
  type VerifyResult,
  type VerifySeverity,
} from "./verification.js";

// Escalation
export {
  runEscalate,
  type AttemptRecord,
  type EscalateOptions,
  type EscalateResult,
} from "./escalate.js";

// Workflow state detection
export * from "./workflow-state.js";

// Next workflow guidance
export * from "./next.js";

// Config generation from templates
export * from "./config-generator.js";

// Pre-signal check (implementor validates before signaling)
export { runPreSignalCheck } from "./pre-signal-check.js";

// Validate handover (validates handover document completeness)
export {
  extractFileOperations,
  runValidateHandover,
} from "./validate-handover.js";

// Command execution utility
export {
  executeCommand,
  type ExecuteOptions,
  type ExecuteResult,
} from "./command-executor.js";

// Pre-signal executor (runs actual build/test/lint commands)
export {
  runPreSignalChecks,
  type PreSignalCheckResult,
  type PreSignalConfig,
  type PreSignalResult,
} from "./pre-signal-executor.js";

// Artifact validator (verifies claimed files exist)
export {
  validateArtifacts,
  type Artifact,
  type ArtifactValidationDetail,
  type ArtifactValidationResult,
} from "./artifact-validator.js";

// Check executor (runs verification checks)
export {
  executeCheck,
  executeStructuralCheck,
  executeBehavioralCheck,
  executeQualityCheck,
  type CheckConfig,
  type CheckResult as ExecutorCheckResult,
} from "./check-executor.js";
