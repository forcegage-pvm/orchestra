/**
 * Test Fixtures
 *
 * Shared test data and constants for MCP handler tests.
 */

/**
 * Valid spec_consultation_notes for tests.
 * Must be at least 200 characters per TD-032 spec-first enforcement.
 */
export const TEST_SPEC_CONSULTATION_NOTES =
  "Consulted spec section T001 for test requirements. The specification requires: " +
  "(1) Task must have clear acceptance criteria, (2) File operations must be defined, " +
  "(3) Deliverables must be listed. Acceptance criteria trace directly to these spec requirements.";

/**
 * Alias for shorter import name
 */
export const SPEC_NOTES = TEST_SPEC_CONSULTATION_NOTES;
