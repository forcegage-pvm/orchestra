# Verifying System Prompts Reach the LLM - Debug Guide

## Your Suspicion Was Valid to Check!

System prompts in Orchestra go through several transformations before reaching the LLM. Here's what happens and how to verify:

## The System Prompt Journey

### 1. Injection (PlayTaskHandler.ts)

```typescript
const systemPrompt = await readAgentInstructions(
  workspaceRoot,
  role,
  promptBuilder,
);
// Injects as role: "system" into AgentSession
```

### 2. Storage (AgentSession)

```typescript
const message: AgentMessage = {
  id: crypto.randomUUID(),
  role: "system", // ✅ Stored as system
  content: systemPrompt,
  timestamp: new Date().toISOString(),
  iteration: 0,
};
```

### 3. Context Compaction (ContextManager.compact())

```typescript
// System messages are ALWAYS preserved, never removed
const systemMessages = messages.filter((msg) => msg.role === "system");
const compacted = [...systemMessages, ...recentMessages]; // ✅ Always first
```

### 4. Conversion to VS Code LM API (convertToLMMessages())

```typescript
// VS Code LM API has no "system" role, so we convert to "User"
const systemLMMessages = systemMessages.map(
  (msg) => vscode.LanguageModelChatMessage.User(msg.content), // ⚠️ System → User
);

return [...systemLMMessages, ...conversationMessages]; // ✅ Prepended
```

### 5. Sent to LLM (sendRequestOnce())

```typescript
await model.sendRequest(messages, { tools }, token); // ✅ First messages are system prompts
```

## How to Verify in DevTools Console

### Step 1: Open DevTools

**In Extension Development Host (when testing):**

1. Press `Ctrl + Shift + P`
2. Run: `Developer: Toggle Developer Tools`
3. Go to **Console** tab

**In Regular VS Code (production extension):**

1. `Help` → `Toggle Developer Tools`
2. Go to **Console** tab

### Step 2: Launch Agent

1. Click Play button on any task
2. Watch Console output

### Step 3: Look for Debug Logs

You should see logs like this:

```
[AgentRunner] Converting 2 system messages to User role (VS Code LM API limitation)
  System 1: # Orchestra Implementor Agent

You are an autonomous coding agent executing tasks within the Orchestra...
  System 2: # Coding Standards

This project follows these conventions:
- TypeScript strict mode...

▼ [AgentRunner] Sending 5 messages to LLM
  1. USER: # Orchestra Implementor Agent... (system prompt converted to User)
  2. USER: # Coding Standards... (coding standards converted to User)
  3. USER: # Task Assignment... (actual user prompt)
  4. ASSISTANT: I'll start by calling get_current_task...
  5. USER: [toolResult] ...
```

### Step 4: Verify System Prompts Are First

**What to check:**

- ✅ System message count matches (2 = main prompt + coding standards)
- ✅ System prompts are converted to User role (this is CORRECT - VS Code LM API limitation)
- ✅ System prompts appear FIRST in the messages array
- ✅ Content preview shows template content (not YAML frontmatter)

**Red flags:**

- ❌ Zero system messages logged
- ❌ System prompt content shows YAML frontmatter (`chatagent:...`)
- ❌ System prompts appear late in message array
- ❌ Content is truncated to very short length (indicates template loading failed)

## Debug Logging Added

I've added two console.log groups to AgentRunner:

### 1. System Message Conversion (line ~2001)

```typescript
console.log(`Converting ${systemMessages.length} system messages to User role`);
systemMessages.forEach((msg, i) => {
  console.log(`  System ${i + 1}: ${msg.content.slice(0, 150)}...`);
});
```

Shows:

- How many system messages exist
- First 150 chars of each (verify template content, not .agent.md)

### 2. Final Message Array (line ~2382)

```typescript
console.group(`Sending ${messages.length} messages to LLM`);
messages.forEach((msg, i) => {
  console.log(`${i + 1}. ${msg.role}: ${preview}...`);
});
console.groupEnd();
```

Shows:

- Total message count sent to LLM
- Role of each message (should start with USER, USER for system prompts)
- First 100 chars of content

## What SUCCESS Looks Like

```
[AgentRunner] Converting 2 system messages to User role (VS Code LM API limitation)
  System 1: # Orchestra Implementor Agent

## Critical: You Are IMPLEMENTOR Role

**TEST EXECUTION POLICY** (lines 8-65):
- **Use `run_tests`** for ALL test execution
- **NEVER use `run_command`** for testing...

  System 2: # Coding Standards

This project uses:
- TypeScript with strict mode...

▼ [AgentRunner] Sending 3 messages to LLM
  1. USER: # Orchestra Implementor Agent... (361 lines)
  2. USER: # Coding Standards... (50 lines)
  3. USER: You have been assigned Task T001...
```

**Key indicators:**

- ✅ 2 system messages converted
- ✅ First message shows "TEST EXECUTION POLICY" near start (not line 138)
- ✅ No YAML frontmatter (`chatagent:`, `tools:`, etc.)
- ✅ System messages sent as first two USER messages

## What FAILURE Would Look Like

```
[AgentRunner] Converting 2 system messages to User role (VS Code LM API limitation)
  System 1: ---
chatagent:
  name: Implementor Agent
  type: agent
  tools:
    - execute/runTests...

▼ [AgentRunner] Sending 3 messages to LLM
  1. USER: ---\nchatagent:\n  name: Implementor... (852 lines with frontmatter)
  2. USER: # Coding Standards...
  3. USER: You have been assigned Task T001...
```

**Red flags:**

- ❌ System 1 starts with YAML frontmatter (`---`, `chatagent:`)
- ❌ Tool names show as `execute/runTests` (VS Code Chat IDs, not AgentTool names)
- ❌ Message is 852 lines (old .agent.md) not 361 lines (template)
- ❌ TEST EXECUTION POLICY would be buried around line 138

## Alternative: Inspect AgentSession Directly

You can also query the AgentSession object in console:

```typescript
// In DevTools Console (when agent is running)
// Access via VS Code's Extension Host context

// This won't work directly - extension context is sandboxed
// But our console.log approach above gives you the same visibility
```

## Common Issues and Solutions

### Issue: No console logs appear

**Cause:** DevTools opened for wrong window

**Solution:**

- Make sure DevTools is for Extension Development Host (when testing)
- Or main VS Code window (when using installed extension)

### Issue: Only 1 system message logged

**Cause:** Coding standards template missing or failed to render

**Solution:**

- Check `extension/dist/templates/prompts/coding-standards.hbs` exists
- Rebuild extension: `cd extension && npm run build`

### Issue: System message shows YAML frontmatter

**Cause:** Template failed to load, fell back to `.agent.md` file

**Solution:**

1. Verify templates copied: `ls extension/dist/templates/prompts/`
2. Check for `system-implementor.hbs`, `system-orchestrator.hbs`, `system-controller.hbs`
3. Rebuild if missing: `cd extension && npm run build`

### Issue: System prompts appear late in message array

**Cause:** Bug in convertToLMMessages() prepending logic

**Solution:** This should not happen with current code - file a bug report

## Next Steps After Verification

1. **Reload Extension:** `Developer: Reload Window` to pick up debug build
2. **Launch Agent:** Play button on test-tools-001 task T001
3. **Check Console:** Verify logs show template content, not .agent.md
4. **Observe Behavior:** Agent should not create verification scripts
5. **Report Findings:** Share console screenshots if issues persist

## Technical Debt Tracking

- **TD-035**: System prompt template deployment (FIXED - templates now copied)
- **NEW**: Add permanent DEBUG mode toggle in settings (vs always-on console.log)
- **NEW**: Add AgentSession inspector in Agent Panel UI (see messages without DevTools)

## Why "User Role" for System Prompts is OK

VS Code Language Model API limitation:

- API only supports `User` and `Assistant` roles
- No `System` role exists in VS Code LM API
- Solution: Convert system → User and prepend
- LLM still receives instructions first (position matters more than role label)

This is standard practice for VS Code Chat extensions - the LLM understands context from message content and position, not just role labels.
