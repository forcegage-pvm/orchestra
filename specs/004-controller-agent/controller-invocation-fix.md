# Controller Invocation Fix (v0.5.2)

## Critical Issues Fixed

User reported three major problems with v0.5.1 controller invocation:

### Issue 1: Opens in Current Chat (Not New)

**Problem:** Controller opened in the current chat window instead of a fresh new editor tab  
**Root Cause:** Used `workbench.action.chat.open` directly which sends to focused chat  
**Solution:** Created `ReviewSprintHandler.ts` using `SessionManager.invokeController()` pattern from implementor

### Issue 2: Terrible Broken Prompt

**Problem:** Prompt showed `"Unknown Sprint" (ID: unknown)` with minimal context  
**Root Cause:** Tree view element structure not understood - used `sprint.label` instead of actual data  
**Solution:**

- Pass proper `Sprint` object from tree view element (`element.sprint`)
- Created `buildSprintReviewPrompt()` in PromptBuilder
- Comprehensive prompt with review standards, decision guidance, sprint context

### Issue 3: No Agent Mode or Model Setting

**Problem:** Controller didn't use `orchestra.controller` mode or `claude-opus-4.5` model  
**Root Cause:** Direct `executeCommand` call didn't specify mode or model  
**Solution:**

- Use `SessionManager.invokeController()` which properly sets mode/model via ConfigService
- Added `orchestra.models.controller` config setting
- Controller now gets Opus 4.5 for highest capability verification

## Implementation Details

### New Handler: ReviewSprintHandler.ts

Follows the same pattern as `PlayTaskHandler.ts` for consistency:

```typescript
export async function handleReviewSprint(
  workspaceRoot: string,
  sprint: Sprint,
): Promise<void> {
  // Get review attempt count from database
  let reviewAttempt = 1;
  if (sprint.status === "SPEC_REVIEW_FAILED") {
    const previousReview = getLatestSprintReview(workspaceRoot, sprint.id);
    if (previousReview) {
      reviewAttempt = (previousReview.revision_count || 0) + 1;
    }
  }

  // Build context for prompt
  const context = {
    sprint: {
      sprint_id: sprint.id,
      title: sprint.name,
      status: sprint.status,
    },
    reviewAttempt,
  };

  // Create instances
  const promptBuilder = new PromptBuilder();
  const sessionManager = getSessionManager();

  // Build and invoke
  const prompt = promptBuilder.buildSprintReviewPrompt(context);
  await sessionManager.invokeController(prompt, []);
}
```

### New Prompt: buildSprintReviewPrompt()

Comprehensive review prompt with:

```typescript
buildSprintReviewPrompt(context: PromptContext): string {
  return `As Controller, review Sprint "${sprint.title}" (ID: ${sprint.sprint_id}) for specification alignment.

## Your Task
Use your MCP tools to perform a comprehensive sprint review:

1. \`review_sprint_config\` - Analyze the sprint configuration:
   - Task breakdown completeness (all spec requirements covered?)
   - Task descriptions clarity and specificity
   - Dependencies correctness and logical ordering
   - Verification criteria adequacy
   - TDD task separation (red/green phases distinct?)
   - Category assignments appropriateness

2. Check against specification:
   - All specified features have corresponding tasks
   - No tasks implement features not in specification
   - Task granularity is appropriate (not too broad/narrow)
   - Technical approach aligns with architectural constraints

3. Make your decision:
   - \`approve_sprint\` - If configuration fully aligns with specification
   - \`reject_sprint\` - If issues found requiring revision

## Sprint Context
- **Sprint ID**: ${sprint.sprint_id}
- **Sprint Title**: ${sprint.title}
- **Review Attempt**: ${reviewAttempt}
${sprint.status === "SPEC_REVIEW_FAILED" ? "\n- **Status**: Previous review REJECTED - address prior feedback" : ""}

## Review Standards
- **Completeness**: Every spec requirement has corresponding task(s)
- **Faithfulness**: No tasks implement unspecified features
- **Clarity**: Task descriptions are specific and actionable
- **Testability**: Verification criteria are measurable
- **Feasibility**: Technical approach is sound given constraints

## Decision Guidance
**APPROVE** if:
- All spec requirements covered by tasks
- Task breakdown is logical and complete
- Verification criteria are adequate
- No specification violations

**REJECT** if:
- Missing tasks for spec requirements
- Tasks implementing unspecified features
- Unclear or overly broad task descriptions
- Inadequate verification criteria
- Logical dependency issues

Provide detailed, actionable feedback for any issues found.`;
}
```

### SessionManager Integration

Controller now uses the same flow as implementor:

```typescript
async invokeController(prompt: string, files: vscode.Uri[]): Promise<void> {
  const model = this._configService.getModelForRole("controller");
  const agentMode = this._configService.getAgentForRole("controller");

  // Create a NEW chat editor tab for controller
  await vscode.commands.executeCommand("workbench.action.openChat");
  await this.delay(200); // Wait for tab to be ready

  // Send prompt with mode and model
  await vscode.commands.executeCommand("workbench.action.chat.open", {
    query: prompt,
    isPartialQuery: false,
    mode: agentMode,
    modelSelector: { id: model },
    attachFiles: files,
  });
}
```

### Configuration Added

New setting in package.json:

```json
"orchestra.models.controller": {
  "type": "string",
  "default": "claude-opus-4.5",
  "description": "AI model to use for the Controller agent - highest capability model for spec verification"
}
```

## Command Flow Comparison

### Before (v0.5.1) - BROKEN

```typescript
orchestra.launchControllerForSprint command
  ↓
Get sprint.id and sprint.label (wrong properties)
  ↓
Build simple string message
  ↓
workbench.action.chat.open (no mode, no model, current chat)
```

### After (v0.5.2) - CORRECT

```typescript
orchestra.launchControllerForSprint command
  ↓
handleReviewSprint(workspaceRoot, element.sprint)
  ↓
Get review attempt count from database
  ↓
Build comprehensive context with sprint data
  ↓
PromptBuilder.buildSprintReviewPrompt(context)
  ↓
SessionManager.invokeController(prompt, [])
  ↓
NEW chat editor tab with:
  - mode: "orchestra.controller"
  - model: "claude-opus-4.5"
  - Comprehensive prompt with review standards
```

## Files Changed

### New Files

- `extension/src/commands/ReviewSprintHandler.ts` - Handler following PlayTaskHandler pattern

### Modified Files

- `extension/src/prompts/PromptBuilder.ts` - Added buildSprintReviewPrompt()
- `extension/src/extension.ts` - Import and call handleReviewSprint()
- `extension/package.json` - Added orchestra.models.controller setting, version 0.5.2
- `extension/src/views/webview/CurrentTaskViewProvider.ts` - Sprint type import

## Consistency with Existing Patterns

This fix aligns controller invocation with the existing orchestrator/implementor patterns:

| Role           | Handler                              | Prompt Builder                | Session Method                | Chat Type           |
| -------------- | ------------------------------------ | ----------------------------- | ----------------------------- | ------------------- |
| Orchestrator   | `handlePlayTask` → `invokePrepare`   | `buildPreparePrompt`          | `sendMessage("orchestrator")` | Persistent floating |
| Implementor    | `handlePlayTask` → `invokeImplement` | `buildImplementPrompt`        | `invokeImplementor`           | New editor tab      |
| **Controller** | **`handleReviewSprint`**             | **`buildSprintReviewPrompt`** | **`invokeController`**        | **New editor tab**  |

## Testing Verification

After installing v0.5.2:

1. **Reload VS Code** to activate new extension
2. **Check sprint tree view** for sprint in PENDING_SPEC_REVIEW status
3. **Click play button** on pending review sprint
4. **Verify:**
   - ✅ Opens NEW chat editor tab (not floating, not current)
   - ✅ Prompt shows actual sprint name and ID
   - ✅ Prompt includes comprehensive review instructions
   - ✅ Mode is `@orchestra.controller`
   - ✅ Model is `claude-opus-4.5`
   - ✅ MCP tools available (orchestra-ctrl server active)
   - ✅ Can use `review_sprint_config`, `approve_sprint`, `reject_sprint`

## Version History

- **v0.5.0** - Initial Controller Agent implementation (Sprint 004)
- **v0.5.1** - UI integration (3 issues: MCP server, play button, current task view)
- **v0.5.2** - Controller invocation fix (3 issues: new chat, prompt quality, mode/model)

## Related Documentation

- See [SessionManager.ts](extension/src/chat/SessionManager.ts) for dual session architecture
- See [PromptBuilder.ts](extension/src/prompts/PromptBuilder.ts) for all prompt templates
- See [PlayTaskHandler.ts](extension/src/commands/PlayTaskHandler.ts) for orchestrator/implementor patterns
- See [ConfigService.ts](extension/src/config/ConfigService.ts) for role-based model configuration
