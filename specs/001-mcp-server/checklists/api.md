# API Requirements Quality Checklist

**Purpose**: Validate MCP tool contract requirements are complete, clear, and consistent  
**Created**: December 4, 2025  
**Feature**: [spec.md](../spec.md), [contracts/](../contracts/)

## Tool Schema Completeness

- [ ] CHK018 - Are input schemas defined for all 10 tools with required/optional clearly marked? [Completeness, Spec §FR-006]
- [ ] CHK019 - Are output schemas defined for all 10 tools with all fields documented? [Completeness, Spec §FR-007]
- [ ] CHK020 - Is the role parameter consistently defined across all tool input schemas? [Consistency, contracts/*.json]
- [ ] CHK021 - Are description fields specific enough to guide agent usage? [Clarity, contracts/*.json]

## Response Schema Consistency

- [ ] CHK022 - Are status values consistently lowercase (pending, in_progress, completed) across all responses? [Consistency, Spec §FR-010]
- [ ] CHK023 - Is the `nextStep` field format consistent across tools that provide workflow guidance? [Consistency, contracts/]
- [ ] CHK024 - Are timestamp formats specified (ISO 8601)? [Clarity, Gap]
- [ ] CHK025 - Are nullable fields explicitly marked with `["type", "null"]` pattern? [Completeness, contracts/status.json]

## Error Response Requirements

- [ ] CHK026 - Are MCP error codes completely mapped for all failure scenarios? [Completeness, Spec §FR-004]
- [ ] CHK027 - Is the error response structure (code, message, data) consistently defined? [Consistency, research.md]
- [ ] CHK028 - Are error messages specified to be actionable per SC-004? [Measurability, Spec §SC-004]
- [ ] CHK029 - Is the behavior specified when core library throws unexpected errors? [Edge Case, Gap]

## Tool Behavior Requirements

- [ ] CHK030 - Are optional parameters specified with default behaviors (e.g., taskId defaults to current)? [Clarity, contracts/]
- [ ] CHK031 - Is the `canRetry` flag behavior completely specified for feedback tool? [Completeness, Spec §FR-019]
- [ ] CHK032 - Are the `nextStep` guidance values exhaustive for each tool's possible outcomes? [Coverage, contracts/]
- [ ] CHK033 - Is the signal tool's file auto-detection behavior specified? [Clarity, User Story 3]

## Naming & Convention Requirements

- [ ] CHK034 - Do all tool names match CLI command names exactly per Q3 decision? [Consistency, Clarifications]
- [ ] CHK035 - Is the underscore vs hyphen convention clear (accept_signal vs accept-signal)? [Clarity, Spec §FR-005]

## Notes

- Focus: Requirements quality for the 10 MCP tool contracts
- Key concern: Consistency across tool schemas enables predictable agent behavior
- Reference: contracts/ directory contains JSON schemas for each tool
