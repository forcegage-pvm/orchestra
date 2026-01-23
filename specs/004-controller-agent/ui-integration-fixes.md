# Controller Agent UI Integration Fixes (v0.5.1)

## Issues Resolved

User testing of v0.5.0 revealed three critical UI integration gaps that prevented the Controller Agent feature from being usable:

### Issue 1: Missing Controller MCP Server

**Problem:** Controller agent exists but has no MCP tools available  
**Root Cause:** `McpServerProvider.provideMcpServerDefinitions()` only returned `orchestra-orc` and `orchestra-imp`  
**Solution:** Added `orchestra-ctrl` server definition with `--role=controller` argument

**Files Modified:**

- `extension/src/mcp/McpServerProvider.ts` - Added third server definition

```typescript
new vscode.McpStdioServerDefinition(
  "orchestra-ctrl",
  "node",
  [mcpServerPath, "--role=controller"],
  { ORCHESTRA_WORKSPACE: this.workspaceRoot },
);
```

### Issue 2: No Sprint Review Button

**Problem:** Sprint shows "Pending Review" status but no action available to trigger review  
**Root Cause:** `SprintTreeProvider` set contextValue to `"sprint-active"` regardless of review state  
**Solution:**

- Updated `_createSprintItem()` to set contextValue based on sprint status
- Added `"sprint-pending-review"` contextValue for sprints needing review
- Added `"orchestra.launchControllerForSprint"` command to package.json
- Added play button menu item for pending review sprints

**Files Modified:**

- `extension/src/views/treeview/SprintTreeProvider.ts` - Conditional contextValue based on status
- `extension/package.json` - New command and menu item
- `extension/src/extension.ts` - Command handler to launch Controller agent chat

```typescript
// SprintTreeProvider.ts
if (
  sprintStatus === "PENDING_SPEC_REVIEW" ||
  sprintStatus === "SPEC_REVIEW_FAILED"
) {
  item.contextValue = isActive
    ? "sprint-pending-review"
    : "sprint-pending-review-inactive";
} else {
  item.contextValue = isActive ? "sprint-active" : "sprint-inactive";
}
```

### Issue 3: Wrong Current Task Display

**Problem:** Current Task view shows "Task 1" when sprint hasn't been reviewed yet  
**Root Cause:** `CurrentTaskViewProvider._refresh()` didn't check sprint status before showing tasks  
**Solution:**

- Modified `_refresh()` to check sprint status first
- Created `_getSprintReviewData()` method for sprint review state
- Created `renderSprintReviewCard()` template function
- Added "Launch Controller" button in sprint review card
- Updated webview message handler and script

**Files Modified:**

- `extension/src/views/webview/CurrentTaskViewProvider.ts` - Sprint status check in refresh
- `extension/src/views/webview/currentTaskTemplate.ts` - Sprint review card template
- `extension/src/database/queries.ts` - Export `getCurrentSprint` and `getLatestSprintReview`

```typescript
// CurrentTaskViewProvider._refresh()
const activeSprint = getCurrentSprint(this._workspaceRoot);
if (
  activeSprint &&
  (activeSprint.status === "PENDING_SPEC_REVIEW" ||
    activeSprint.status === "SPEC_REVIEW_FAILED")
) {
  // Show sprint review info instead of tasks
  void this._view.webview.postMessage({
    command: "update",
    data: this._getSprintReviewData(activeSprint),
  });
  return;
}
```

## Additional Changes

### Configuration

Added controller agent setting to package.json:

```json
"orchestra.agents.controller": {
  "type": "string",
  "default": "orchestra.controller",
  "description": "Agent mode identifier for the Controller role"
}
```

### Command Integration

The `launchControllerForSprint` command opens VS Code chat with the Controller agent and a pre-filled message:

```typescript
await vscode.commands.executeCommand("workbench.action.chat.open", {
  query: `@${controllerAgent} Review the sprint configuration for "${sprintName}" (ID: ${sprintId}). Use the orchestra-ctrl MCP tools to review the sprint configuration against the specification, then either approve or reject with detailed feedback.`,
});
```

## Testing Checklist

- [x] Extension builds without TypeScript errors
- [x] VSIX packaged successfully (v0.5.1)
- [x] Extension installed in VS Code
- [ ] Verify orchestra-ctrl appears in agent MCP tools list
- [ ] Create test sprint in PENDING_SPEC_REVIEW status
- [ ] Verify play button appears on pending review sprint in tree view
- [ ] Click play button and verify Controller agent chat launches with correct message
- [ ] Verify Current Task view shows "Sprint Review Required" card instead of Task 1
- [ ] Click "Launch Controller Agent" button in Current Task view
- [ ] Verify Controller can use orchestra-ctrl MCP tools (review_sprint_config, approve_sprint, etc.)

## Files Changed

### Extension Core

- `extension/src/mcp/McpServerProvider.ts` - Added controller server
- `extension/src/extension.ts` - Added launchControllerForSprint command handler
- `extension/package.json` - Version bump, command, menu, setting

### UI Components

- `extension/src/views/treeview/SprintTreeProvider.ts` - Sprint status contextValue
- `extension/src/views/webview/CurrentTaskViewProvider.ts` - Sprint review check
- `extension/src/views/webview/currentTaskTemplate.ts` - Sprint review card template

### Documentation

- `.github/agents/orchestra.controller.agent.md` - New controller agent prompt

## Deployment

```bash
# Build and package
cd extension
npm run build
npx @vscode/vsce package --out orchestra-0.5.1.vsix

# Install
code --install-extension orchestra-0.5.1.vsix --force

# Commit and push
git add -A
git commit -m "Fix Controller Agent UI integration issues (v0.5.1)"
git push origin 004-controller-agent
```

## Next Steps

1. **User Testing:** Install v0.5.1 and verify all three issues are resolved
2. **Controller Agent Prompt:** Create the `orchestra.controller.agent.md` file with proper Controller workflow instructions
3. **End-to-End Test:** Run full Controller workflow:
   - Configure sprint → Sprint enters PENDING_SPEC_REVIEW
   - Launch Controller → Review sprint config
   - Approve sprint → Sprint becomes ACTIVE
   - Prepare task → Task enters PENDING_HANDOVER_REVIEW
   - Launch Controller → Review handover
   - Approve handover → Task moves to IMPLEMENT
4. **Documentation:** Update user guide with Controller workflow screenshots
5. **Sprint 004 Completion:** Mark sprint complete once E2E test passes

## Technical Notes

### MCP Server Architecture

Orchestra now runs three separate MCP server instances:

- `orchestra-orc` (Orchestrator) - 20 tools for task preparation and verification
- `orchestra-imp` (Implementor) - 8 tools for task execution
- `orchestra-ctrl` (Controller) - 10 tools for specification review

All three run the same `index.js` with different `--role` arguments. Role filtering in `src/mcp-server/tools.ts` ensures each agent only sees their authorized tools.

### Context Value Pattern

VS Code uses `TreeItem.contextValue` to enable/disable menu commands. The pattern used:

- `sprint-active` - Active sprint with no review needed
- `sprint-inactive` - Inactive sprint
- `sprint-pending-review` - Active sprint needing Controller review
- `sprint-pending-review-inactive` - Inactive sprint needing review

Menu items in package.json use `when` clauses with regex to match these values.

### Sprint Review Display

The webview handles two data types:

1. `TaskData` - Regular task display (existing)
2. `type: "sprint-review"` - Sprint review display (new)

The `generateCurrentTaskHtml()` function checks `data.type` and routes to the appropriate rendering function.

## Version History

- **v0.5.0** - Initial Controller Agent implementation (Sprint 004 Phases 1-8)
- **v0.5.1** - UI integration fixes (3 critical issues resolved)
