# TD-012: Extension ESM Migration

**Created**: 2025-12-10
**Status**: OPEN
**Priority**: Low
**Sprint**: sprint-001-extension-foundation

## Problem

The main Orchestra project uses ESM (`"type": "module"`) while the VS Code extension uses CommonJS (default). This prevents the extension from directly importing the Drizzle schema from `src/db/schema.ts`.

## Current Workaround

The extension maintains a local copy of the schema in `extension/src/database/local-schema.ts`. This duplicates the Drizzle table definitions.

## Risks

- **Schema Drift**: If main schema changes, extension copy must be manually updated
- **Maintenance Burden**: Two files to maintain for the same schema
- **Type Safety**: No compile-time guarantee schemas match

## Options to Evaluate

### Option A: Convert Extension to ESM
- Add `"type": "module"` to `extension/package.json`
- Update esbuild config for ESM output format
- Test native module (better-sqlite3) compatibility
- Verify VS Code extension host loads correctly

**Pros**: Single source of truth, modern module system
**Cons**: Risk of breaking extension loading, native module issues

### Option B: Build-time Schema Copy
- Create `scripts/copy-schema.js` that copies schema at build time
- Add `"prebuild": "node scripts/copy-schema.js"` to extension scripts
- Ensure schema is always fresh

**Pros**: Automated sync, no manual updates
**Cons**: Build complexity, still two files at runtime

### Option C: Shared NPM Package
- Create `@orchestra/schema` package
- Publish to npm or use workspace linking
- Both projects import from shared package

**Pros**: True single source, proper package architecture
**Cons**: Overkill for current project size, publishing overhead

## Recommendation

Re-evaluate after Sprint 001 completion. If schema proves stable (few changes), the current workaround is acceptable. If schema changes frequently, implement Option B.

## Related Files

- `src/db/schema.ts` - Main project schema (ESM)
- `extension/src/database/local-schema.ts` - Extension copy (CommonJS)
- `extension/package.json` - Extension module config
