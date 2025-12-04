# Phase 2: MCP Server - Tasks

> **Sprint**: phase-2-mcp  
> **Goal**: Expose Orchestra operations as MCP tools for AI agents

---

## Tasks

- [ ] T001 [P] Project Setup - Add MCP SDK, create `src/mcp/` folder structure
  - See: [2.1-project-setup.md](tasks/2.1-project-setup.md)
  - Category: INFRASTRUCTURE
  - Dependencies: none

- [ ] T002 [P] Server Core - MCP server entry point, tool registry, error handling
  - See: [2.2-server-core.md](tasks/2.2-server-core.md)
  - Category: INFRASTRUCTURE
  - Dependencies: [1]

- [ ] T003 [P] prepare_task Tool - Wrap prepare handover as MCP tool
  - See: [2.3-prepare-task.md](tasks/2.3-prepare-task.md)
  - Category: INTEGRATION
  - Dependencies: [2]

- [ ] T004 [P] signal_complete Tool - Wrap accept-signal flow as MCP tool
  - See: [2.4-signal-complete.md](tasks/2.4-signal-complete.md)
  - Category: INTEGRATION
  - Dependencies: [2]

- [ ] T005 [P] get_context Tool - Wrap status command as MCP tool
  - See: [2.5-get-context.md](tasks/2.5-get-context.md)
  - Category: INTEGRATION
  - Dependencies: [2]

- [ ] T006 [P] validate_handover Tool - Check handover completeness
  - See: [2.6-validate-handover.md](tasks/2.6-validate-handover.md)
  - Category: INTEGRATION
  - Dependencies: [2]

- [ ] T007 [P] complete_task Tool - Mark task complete, archive results
  - See: [2.7-complete-task.md](tasks/2.7-complete-task.md)
  - Category: INTEGRATION
  - Dependencies: [2]

- [ ] T008 [P] Integration Testing - E2E MCP workflow testing
  - See: [2.8-integration-testing.md](tasks/2.8-integration-testing.md)
  - Category: INTEGRATION
  - Dependencies: [3, 4, 5, 6, 7]

---

## Legend

- `[x]` = Completed
- `[ ]` = Pending
- `[P]` = Priority (must complete)
