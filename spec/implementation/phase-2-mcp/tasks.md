# Phase 2: MCP Server - Tasks

> **Sprint**: phase-2-mcp  
> **Goal**: Expose Orchestra operations as MCP tools for AI agents  
> **Status**: BLOCKED by Phase 1.2 CLI Tech Debt

---

## Tasks

- [ ] T001 [P] Project Setup - Add MCP SDK, create `src/mcp/` folder structure
  - See: [2.1-project-setup.md](tasks/2.1-project-setup.md)
  - Category: INFRASTRUCTURE
  - Dependencies: Phase 1.2 complete

- [ ] T002 [P] Server Core - MCP server entry point, tool registry, error handling
  - See: [2.2-server-core.md](tasks/2.2-server-core.md)
  - Category: INFRASTRUCTURE
  - Dependencies: [1]

- [ ] T003 [P] init Tool - Wrap `orchestra init` as MCP tool
  - See: [2.3-init.md](tasks/2.3-init.md)
  - Category: INTEGRATION
  - Dependencies: [2]

- [ ] T004 [P] status Tool - Wrap `orchestra status` as MCP tool
  - See: [2.4-status.md](tasks/2.4-status.md)
  - Category: INTEGRATION
  - Dependencies: [2]

- [ ] T005 [P] closeout Tool - Wrap `orchestra closeout` as MCP tool
  - See: [2.5-closeout.md](tasks/2.5-closeout.md)
  - Category: INTEGRATION
  - Dependencies: [2]

- [ ] T006 [P] prepare Tool - Wrap `orchestra prepare` as MCP tool
  - See: [2.6-prepare.md](tasks/2.6-prepare.md)
  - Category: INTEGRATION
  - Dependencies: [2]

> **Removed**: T007 signal Tool - No CLI command exists. Signaling is done via manual file editing.

- [ ] T008 [P] accept_signal Tool - Wrap `orchestra accept-signal` as MCP tool
  - See: [2.8-accept-signal.md](tasks/2.8-accept-signal.md)
  - Category: INTEGRATION
  - Dependencies: [2]

- [ ] T009 [P] verify Tool - Wrap `orchestra verify` as MCP tool
  - See: [2.9-verify.md](tasks/2.9-verify.md)
  - Category: INTEGRATION
  - Dependencies: [2]

- [ ] T010 [P] complete Tool - Wrap `orchestra complete` as MCP tool
  - See: [2.10-complete.md](tasks/2.10-complete.md)
  - Category: INTEGRATION
  - Dependencies: [2]

- [ ] T011 [P] feedback Tool - Wrap `orchestra feedback` as MCP tool
  - See: [2.11-feedback.md](tasks/2.11-feedback.md)
  - Category: INTEGRATION
  - Dependencies: [2], Phase 1.2 T001

- [ ] T012 [P] escalate Tool - Wrap `orchestra escalate` as MCP tool
  - See: [2.12-escalate.md](tasks/2.12-escalate.md)
  - Category: INTEGRATION
  - Dependencies: [2], Phase 1.2 T002

- [ ] T013 [P] Integration Testing - E2E MCP workflow testing
  - See: [2.13-integration-testing.md](tasks/2.13-integration-testing.md)
  - Category: INTEGRATION
  - Dependencies: [3-12]

---

## Legend

- `[x]` = Completed
- `[ ]` = Pending
- `[P]` = Priority (must complete)
