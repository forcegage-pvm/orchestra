# API Requirements Quality Checklist

**Purpose**: Validate MCP tool contract requirements are complete, clear, and consistent  
**Created**: December 4, 2025  
**Feature**: [spec.md](../spec.md), [contracts/](../contracts/)  
**Last Reviewed**: December 4, 2025

## Tool Schema Completeness

- [x] CHK018 - Are input schemas defined for all 10 tools with required/optional clearly marked? [Completeness, Spec §FR-006] ✅ All 10 contracts in contracts/*.json with required arrays
- [x] CHK019 - Are output schemas defined for all 10 tools with all fields documented? [Completeness, Spec §FR-007] ✅ outputSchema in all contracts
- [x] CHK020 - Is the role parameter consistently defined across all tool input schemas? [Consistency, contracts/*.json] ✅ All use same role enum definition
- [x] CHK021 - Are description fields specific enough to guide agent usage? [Clarity, contracts/*.json] ✅ Each tool has descriptive text with role requirement

## Response Schema Consistency

- [x] CHK022 - Are status values consistently lowercase (pending, in_progress, completed) across all responses? [Consistency, Spec §FR-010] ✅ FR-010 requires lowercase; contracts use lowercase
- [x] CHK023 - Is the `nextStep` field format consistent across tools that provide workflow guidance? [Consistency, contracts/] ✅ All use `const` string values
- [x] CHK024 - Are timestamp formats specified (ISO 8601)? [Clarity, Spec §FR-026] ✅ FR-026 + contracts/README.md documents format
- [x] CHK025 - Are nullable fields explicitly marked with `["type", "null"]` pattern? [Completeness, contracts/status.json] ✅ status.json uses union type for nullable fields

## Error Response Requirements

- [x] CHK026 - Are MCP error codes completely mapped for all failure scenarios? [Completeness, contracts/README.md] ✅ Error codes table in contracts/README.md
- [x] CHK027 - Is the error response structure (code, message, data) consistently defined? [Consistency, contracts/README.md] ✅ Common patterns section documents structure
- [x] CHK028 - Are error messages specified to be actionable per SC-004? [Measurability, Spec §SC-004] ✅ SC-004: "100% coverage (no generic error messages)"
- [x] CHK029 - Is the behavior specified when core library throws unexpected errors? [Edge Case, Spec Edge Cases] ✅ Added to edge cases: wrap in -32000, don't expose stack

## Tool Behavior Requirements

- [x] CHK030 - Are optional parameters specified with default behaviors (e.g., taskId defaults to current)? [Clarity, contracts/] ✅ Descriptions note defaults (e.g., "defaults to current task")
- [x] CHK031 - Is the `canRetry` flag behavior completely specified for feedback tool? [Completeness, Spec §FR-025] ✅ FR-025: "After 3 failed attempts, canRetry: false"
- [x] CHK032 - Are the `nextStep` guidance values exhaustive for each tool's possible outcomes? [Coverage, contracts/] ✅ Each contract has explicit nextStep values
- [x] CHK033 - Is the signal tool's file auto-detection behavior specified? [Clarity, Edge Cases + signal.json] ✅ Edge case documents git working tree detection; contract notes "auto-detected if omitted"

## Naming & Convention Requirements

- [x] CHK034 - Do all tool names match CLI command names exactly per Q3 decision? [Consistency, Spec §FR-005] ✅ FR-005: "exactly 10 tools matching CLI command names"
- [x] CHK035 - Is the underscore vs hyphen convention clear (accept_signal vs accept-signal)? [Clarity, Spec §FR-027] ✅ FR-027: underscore for MCP, hyphen for CLI

## Notes

- Focus: Requirements quality for the 10 MCP tool contracts
- Key concern: Consistency across tool schemas enables predictable agent behavior
- Reference: contracts/ directory contains JSON schemas for each tool

**Review Status**: ✅ All 18 items addressed - requirements complete
