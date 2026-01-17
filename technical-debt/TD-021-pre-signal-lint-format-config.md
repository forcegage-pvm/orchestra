# TD-021: Pre-Signal Lint/Format Configuration

## Status: OPEN

## Created: 2026-01-16

## Summary

The pre-signal check configuration for lint and format commands is inconsistent across project types and lacks proper separation between formatting and linting concerns.

## Current State

| Check | Flutter | TypeScript/Node |
|-------|---------|-----------------|
| **build** | `flutter analyze` | `npm run build` |
| **test** | `flutter test --exclude-tags tdd-red` | `npm test -- --exclude="**/tdd-red/**"` |
| **lint** | `dart format --set-exit-if-changed .` | *(undefined - not run)* |

## Issues Identified

### 1. Naming Confusion
- Flutter's "lint" slot runs `dart format` which is formatting, not linting
- `flutter analyze` (in build) actually performs linting
- TypeScript has no lint check at all

### 2. Missing Checks
- TypeScript projects don't run ESLint (`npm run lint`) 
- No format checking for TypeScript (Prettier not detected)

### 3. Semantic Mismatch

| Purpose | Flutter | TypeScript |
|---------|---------|------------|
| Type/compile check | `flutter analyze` | `npm run build` (tsc) |
| Lint (warnings, deprecations) | `flutter analyze` | `npm run lint` (ESLint) - NOT RUN |
| Format | `dart format` | Prettier or ESLint - NOT RUN |

## Proposed 4-Check Model

| Check | Purpose | Flutter | TypeScript/Node |
|-------|---------|---------|-----------------|
| **build** | Compile/type check | `flutter analyze` | `npm run build` |
| **test** | Run tests | `flutter test --exclude-tags tdd-red` | `npm test -- --exclude="**/tdd-red/**"` |
| **format** | Code formatting | `dart format --set-exit-if-changed .` | `npx prettier --check .` (if available) |
| **lint** | Warnings, deprecations | *(covered by build)* | `npm run lint` (if script exists) |

## Key Findings

### dart format behavior
- `dart format .` - formats files, always exits 0
- `dart format --set-exit-if-changed .` - formats files, exits 1 if any changed
- Current config uses `--set-exit-if-changed` which fails if code wasn't pre-formatted

### ESLint capabilities  
- `npm run lint` - check only, exit 1 on issues
- `npm run lint -- --fix` - auto-fix formatting AND linting issues
- ESLint can cover formatting rules (indent, semi, quotes, etc.)

### Detection considerations
- TypeScript: Need to check if `lint` script exists in package.json before defaulting
- TypeScript: Need to check if Prettier is installed before defaulting to format check
- Flutter: `dart format` is always available (built into Dart SDK)

## Options

### Option A: Keep 3 checks, fix naming
Rename current "lint" to "format" semantically, add actual lint for TypeScript.

### Option B: Add 4th check slot
Add explicit format vs lint separation in the check system.

### Option C: Conditional defaults
- Node: Check for `lint` script in package.json, use `npm run lint` if exists
- Node: Check for Prettier, use `npx prettier --check .` if available
- Flutter: Keep current behavior

## Database Config Issue (Unrelated)

The seeded config keys (`pre_signal_checks.lint`) don't match what the handler reads (`pre_signal_lint_command`), so the npm defaults in the config table are actually ignored and auto-detection works. This is accidental but correct behavior.

## Resolution

Parked pending broader pre-signal check architecture review.

## Related Files

- [src/core/pre-signal-executor.ts](../src/core/pre-signal-executor.ts) - Detection and defaults
- [src/mcp-server/handlers/signal-completion.ts](../src/mcp-server/handlers/signal-completion.ts) - Config loading
- [src/db/init.ts](../src/db/init.ts) - Config seeding (mismatched keys)
