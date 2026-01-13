# SessionManager Research & Testing Plan

**Last Updated:** 2025-12-30

## Executive Summary

### 🎯 BREAKTHROUGH: Background Agent Sessions Work! (2025-12-30)

**We CAN programmatically create dedicated, targetable chat sessions!**

| Command | Tab Label | Session Type |
|---------|-----------|--------------|
| `workbench.action.chat.openNewSessionEditor.copilotcli` | **"Background Agent"** | Editor tab |
| `workbench.action.chat.openNewSessionEditor.copilot-cloud-agent` | **"Cloud Agent"** | Editor tab |
| `github.copilot.cli.sessions.newTerminalSession` | **"Background Agent"** | Terminal-integrated CLI |

**Key Finding:** These commands create **distinct, labeled editor tabs** that can be:
1. **Identified by label** - "Background Agent" vs "Cloud Agent" 
2. **Created programmatically** - No user interaction required
3. **Used as dedicated channels** - Each session is separate

**Our detection failed initially** because we filtered for "Chat" in tab labels, but actual labels are:
- "Background Agent" (for `copilotcli`)
- "Cloud Agent" (for `copilot-cloud-agent`)

### Previous Conclusion (Superseded)

~~DEFINITIVE FINDING: There is NO public API for deterministic chat session targeting in VS Code.~~

The standard `workbench.action.chat.open*` commands still have the limitations documented below, but the **background agent commands provide a viable alternative** for creating dedicated sessions.

**Recommended Solution:** Use Background Agent sessions for orchestrator/implementor isolation (see bottom of document)

---

## Current Problem

The SessionManager struggles to route prompts to the correct chat instance (orchestrator floating window vs implementor editor tab). The core challenge is that VS Code's `workbench.action.chat.open` sends to **whichever chat is currently focused**, not a specific target.

---

## Integration Test Results (2025-12-28)

All 5 integration tests **PASSED**. Here are the empirical findings:

### Test 1: `testOpenChatCreatesEditorTab`
- **Command:** `workbench.action.chat.open`
- **Result:** Creates exactly 1 new editor tab
- **Finding:** ✅ Confirmed behavior

### Test 2: `testNewChatWindowCreatesFloatingWindow`
- **Command:** `workbench.action.newChatWindow`
- **Result:** Creates a separate floating window (tab count in main window unchanged)
- **Finding:** ✅ Confirmed behavior

### Test 3: `testChatOpenTargetsFocused`
- **Setup:** Created window + tab (2 chat instances)
- **Result:** Message went to the focused chat
- **Finding:** ✅ **CRITICAL** - `workbench.action.chat.open` routes to FOCUSED chat, not most recent

### Test 4: `testClosingTabsLeavesWindowAsTarget`
- **Setup:** Created window + tab, then closed all tabs
- **Result:** After closing tabs (0 remaining), message went to the floating window
- **Finding:** ✅ Closing tabs successfully redirects to remaining window

### Test 5: `testTabIdentification`
- **Result:** Chat tabs have label **"Chat"** and can be identified via `vscode.window.tabGroups`
- **Chat tab found:** "Chat" in group 2
- **Finding:** ✅ Tab identification by label works reliably

---

## Agent-Specific Command Tests (2025-12-28)

All 5 agent command tests **PASSED**. Critical findings:

### Test 1: Commands Exist ✅
- `workbench.action.chat.openorchestra.orchestrator` - **EXISTS**
- `workbench.action.chat.openorchestra.implementor` - **EXISTS**

### Test 2: Orchestrator Command ✅
- Executed without errors
- **Tabs: 0 → 0** (no editor tab created)
- Successfully sent query: "TEST: Orchestrator agent command"

### Test 3: Implementor Command ✅
- Executed without errors
- **Tabs: 0 → 0** (no editor tab created)
- Successfully sent query: "TEST: Implementor agent command"

### Test 4: Parameters ✅
- Commands accept `query`, `isPartialQuery`, `mode`, and `modelSelector` parameters
- Cannot verify which mode/model was used via public API

### Test 5: Code Editor Safety ✅
- Non-chat tabs preserved: 1 before → 1 after
- Only chat tabs are closed by cleanup logic
- Code editor tabs are **SAFE**

### Key Finding: Agent Commands Don't Create Editor Tabs

**CRITICAL OBSERVATION**: The agent-specific commands (`workbench.action.chat.openorchestra.*`) executed successfully but did **NOT create editor tabs** (tab count remained 0 → 0).

**Possible explanations:**
1. Commands opened chat in **sidebar** (not as editor tabs)
2. Commands opened chat in **floating window** (not tracked in tab groups)
3. Commands opened chat in **panel** (bottom panel, not editor area)
4. Commands require additional parameters to specify location

**Implication**: These commands might solve our routing problem if they consistently open in a predictable location (e.g., always sidebar, always window). Need to verify WHERE they opened.

### Follow-up Tests (2025-12-28)

**Experiment A: Closed Sidebar Chat → Reopened Previous Chat**
- User closed sidebar chat, ran test
- Command **reopened the previously closed chat** 
- Suggests VS Code has chat session persistence/restoration

**Experiment B: Editor Tab Chat → Different Behaviors!**
- Orchestrator command: Sent to **existing focused editor tab** (current chat)
- Implementor command: **Created second editor tab briefly, then closed**
- Tab count still showed 0 → 0 (test cleanup may interfere)

### Isolated Tests (2025-12-28) - CRITICAL FINDING

Ran isolated tests with NO cleanup to observe raw behavior:

**Result: INCONSISTENT ROUTING**
- Sometimes creates new sidebar panel
- Sometimes reuses existing chat instance
- Sometimes directs to editor tab
- Sometimes directs to sidebar

**Conclusion: Agent-specific commands (`workbench.action.chat.openorchestra.*`) do NOT solve the routing problem.** They are just wrappers that set the agent mode but still use focus-based routing internally.

### Root Cause Confirmed

The `workbench.action.chat.open*` commands ALL use the same underlying routing logic:
1. If a chat is currently focused → send to that chat
2. If no chat is focused → behavior is unpredictable (sidebar vs editor vs last used)

**There is NO built-in way to target a specific chat instance programmatically.**

---

## Discovered Commands (2025-12-28)

The integration tests discovered **260+ chat-related commands**. Key findings:

### Auto-Generated Agent Commands
VS Code automatically generates `open` commands for registered chat participants:

| Command | Description |
|---------|-------------|
| `workbench.action.chat.openorchestra.implementor` | Open chat with orchestra.implementor agent |
| `workbench.action.chat.openorchestra.orchestrator` | Open chat with orchestra.orchestrator agent |
| `workbench.action.chat.opensoftware-engineer-agent-v1` | Open chat with custom agent mode |

**Implication:** We can programmatically open a chat pre-configured for a specific agent without `@mentions`.

### Session Location Commands

| Command | Behavior |
|---------|----------|
| `workbench.action.chat.openSessionInEditorGroup` | Open session in existing editor group |
| `workbench.action.chat.openSessionInNewEditorGroup` | Open session in new side-by-side group |
| `workbench.action.chat.openSessionInNewWindow` | Open session in new floating window |
| `workbench.action.chat.openSessionInSidebar` | Open session in sidebar |
| `workbench.action.chat.continueChatInSession` | Continue in existing session |

### New Chat Creation Commands

| Command | Behavior |
|---------|----------|
| `workbench.action.chat.newChatInNewWindow` | New chat in new window |
| `workbench.action.chat.newChatInSideBar` | New chat in sidebar |
| `workbench.action.newChatWindow` | New floating window with chat |
| `workbench.action.openChat` | New chat as editor tab |

### Background/CLI Agent Commands (copilotcli pattern)

| Command | Behavior |
|---------|----------|
| `workbench.action.chat.openNewSessionEditor.copilotcli` | ✅ EXISTS - Opens CLI agent session as editor |
| `workbench.action.chat.openNewSessionSidebar.copilotcli` | Opens CLI agent session in sidebar |
| `workbench.view.chat.sessions.copilotcli.focus` | Focus CLI agent sessions view |
| `workbench.view.chat.sessions.copilotcli.open` | Open CLI agent sessions view |

**Note:** `workbench.action.chat.newBackgroundAgent` does NOT exist.

### Session View Commands

| Command | Behavior |
|---------|----------|
| `workbench.view.chat.sessions` | Chat sessions view |
| `workbench.view.chat.sessions.local.focus` | Focus local sessions |
| `workbench.view.chat.sessions.local.open` | Open local sessions view |

---

## Available Chat Commands (from VS Code source)

### Session Creation Commands

| Command | Behavior |
|---------|----------|
| `workbench.action.chat.newChat` | Clears current panel, starts new session |
| `workbench.action.chat.newChatEditor` | Opens NEW chat as editor tab |
| `workbench.action.newChatWindow` | Opens NEW chat in floating (auxiliary) window |
| `workbench.action.openChat` | Opens chat in editor area (creates tab) |

### Session Interaction Commands

| Command | Behavior |
|---------|----------|
| `workbench.action.chat.open` | Sends query to **currently focused** chat |
| `workbench.action.chat.toggle` | Toggle chat panel visibility |
| `workbench.action.chat.openModePicker` | Show mode selection picker |

### Session Management Commands

| Command | Behavior |
|---------|----------|
| `workbench.action.chat.focusAgentSessionsViewer` | Focus the sessions viewer |
| `workbench.action.chat.openSessionInNewEditorGroup` | Open session in side-by-side |
| `workbench.action.chat.openSessionInNewWindow` | Open session in new window |

---

## BREAKTHROUGH: Session Resource URIs (2025-12-28)

**Analysis of VS Code source code reveals the internal session targeting mechanism!**

### Key Discovery: `IChatWidgetService.openSession()`

VS Code's internal chat service **DOES** support deterministic session targeting via `sessionResource` URIs:

```typescript
// From VS Code source: chatWidgetService.ts
export interface IChatWidgetService {
  openSession(sessionResource: URI, target?: typeof ChatViewPaneTarget): Promise<IChatWidget | undefined>;
  openSession(sessionResource: URI, target?: PreferredGroup, options?: IChatEditorOptions): Promise<IChatWidget | undefined>;
  getWidgetBySessionResource(sessionResource: URI): IChatWidget | undefined;
}
```

### Available Methods

| Method | Purpose |
|--------|---------|
| `openSession(sessionResource, target, options)` | Open/reveal a specific session by URI |
| `getWidgetBySessionResource(sessionResource)` | Get widget for a specific session |
| `ChatEditorInput.getNewEditorUri()` | Generate a new unique session URI |
| `chatService.startSession(location)` | Start new session, returns `IChatModelReference` with `sessionResource` |

### Session Resource Schemes

| Scheme | Purpose |
|--------|---------|
| `vscode-chat-editor` | Editor-based chat sessions |
| `vscode-local-chat-session` | Local (sidebar/panel) chat sessions |
| `{custom}` | Contributed session types (like GitHub MCP agents) |

### The Problem: These APIs Are Internal

The `IChatWidgetService` is an **internal VS Code service** not exposed to the public extension API:
- `vscode.commands.executeCommand()` does NOT accept `sessionResource` as a parameter
- No public API to get a session's URI after creation
- No public API to target a specific session

### Workaround Possibilities

1. **Track URIs via Tab Labels**: Chat editor tabs are named with session info
2. **Use `workbench.action.chat.continueChatInSession`**: May accept session identifier (needs testing)
3. **Create dedicated windows**: Floating windows are isolated from sidebar
4. **Use MCP server approach**: MCP tools execute in context of the agent that called them

### Next Steps for Testing

1. Test `workbench.action.chat.continueChatInSession` with session parameters
2. Test `workbench.action.chat.openSessionInNewWindow` with existing session URI
3. Investigate if editor tabs expose session URIs via `vscode.window.tabGroups`
4. Check if extension API provides access to `IChatWidgetService` indirectly

---

## Analysis: Current SessionManager vs Test Findings

### What the Current Implementation Does Right

1. ✅ Uses `workbench.action.newChatWindow` for orchestrator (creates floating window)
2. ✅ Uses `workbench.action.openChat` for implementor (creates editor tab)
3. ✅ Closes implementor tabs before orchestrator calls (ensures single target)
4. ✅ Uses delays to wait for windows/tabs to be ready

### What May Be Causing Issues

1. **No window focus guarantee**: After creating the orchestrator window, if user clicks elsewhere, it loses focus. The `workbench.action.chat.open` will then send to whatever IS focused.

2. **Boolean state tracking is fragile**: `_orchestratorActive` is just a boolean. If the user manually closes the orchestrator window, this flag becomes stale.

3. **No re-focus mechanism**: On subsequent orchestrator calls, we assume the window still exists and is focusable, but we have no way to verify or re-focus it.

4. **Race conditions**: The delays (100ms, 200ms, 300ms) are arbitrary. Window creation may take longer on slow machines.

### Key Insight from Tests

**The "close all tabs" strategy WORKS** - Test 4 proved that closing all chat tabs successfully redirects messages to the remaining floating window. The current implementation uses this approach correctly.

The remaining question is: **Why does it still fail sometimes?**

Possible causes:
1. User has multiple floating windows open (not just our orchestrator)
2. The orchestrator window was closed by user (stale `_orchestratorActive` flag)
3. Timing issues - tab closing or window creation not complete before message sent
4. VS Code sidebar chat panel is open and focused (not tracked)

---

## Key Discoveries

### 1. Background Agents (`AgentSessionProviders.Background`)

From the research:
```typescript
export enum AgentSessionProviders {
  Local = localChatSessionType,
  Background = 'copilotcli',      // <-- Background agent provider!
  Cloud = 'copilot-cloud-agent',
}
```

Background agents run **asynchronously** without blocking the UI. This is potentially perfect for our workflow!

**How to create a background agent job:**
```typescript
// From chatContinueInAction.ts
commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${continuationTarget.type}`);
// Where continuationTarget.type = AgentSessionProviders.Background
```

### 2. Session Resources (URIs)

Every chat session has a unique URI (`sessionResource`). The key insight:
```typescript
// From agentSessionsOpener.ts
await chatWidgetService.openSession(uri, this.getTargetGroup(), {
  ...options,
  pinned: true
});
```

**If we can get/store the session resource URI, we can re-open specific sessions!**

### 3. Chat Widget Service

```typescript
interface IChatWidgetService {
  lastFocusedWidget: IChatWidget | undefined;
  getWidgetBySessionResource(sessionResource: URI): IChatWidget | undefined;
  openSession(sessionResource: URI, targetGroup: PreferredGroup, options?: IChatEditorOptions): Promise<void>;
}
```

This is THE key service - it can open specific sessions by URI!

### 4. `chat.open` Options

```typescript
await vscode.commands.executeCommand('workbench.action.chat.open', {
  query: 'Your prompt here',
  isPartialQuery: false,     // Auto-send if false
  mode: 'agent',             // Agent mode
  modelSelector: { id: 'claude-sonnet-4' },  // Model selection
  attachFiles: [uri],        // Attach files
  // NOTE: No 'sessionResource' option in stable API!
});
```

## Potential Solutions (Refined After Testing)

### Solution A: Use Agent-Specific Open Commands (NEW - RECOMMENDED)

Use the auto-generated `workbench.action.chat.open<agentId>` commands:

```typescript
// Instead of generic workbench.action.chat.open
await vscode.commands.executeCommand('workbench.action.chat.openorchestra.orchestrator', {
  query: prompt,
  // ... other options
});
```

**Pros:**
- Directly targets our registered agent
- No focus management needed (maybe?)
- Clean, simple API

**Cons:**
- Untested - need to verify this actually routes correctly
- May still create new sessions instead of reusing

**Status:** NEEDS TESTING

---

### Solution B: Background Agents for Implementor (IDEAL if available)

Use background agents for the implementor workflow:
- Runs autonomously without UI interference
- No session routing conflicts
- Perfect for "fire and forget" implementation tasks

**Command discovered:** `workbench.action.chat.openNewSessionEditor.copilotcli`

```typescript
await vscode.commands.executeCommand('workbench.action.chat.openNewSessionEditor.copilotcli', {
  query: prompt,
  mode: 'orchestra.implementor',
});
```

**Pros:**
- Background agents run without blocking UI
- Less routing conflicts

**Cons:**
- Requires Copilot extension to provide background agent capability
- May need extension to extension communication
- Less visible progress to user
- `copilotcli` is for CLI agent, not sure how to use with custom agents

**Status:** NEEDS INVESTIGATION - how do we create a background session for OUR agent?

---

### Solution C: Session URI Tracking (Original idea)

Store the session URI after creation, then re-open by URI:

```typescript
class SessionManager {
  private orchestratorSessionUri: vscode.Uri | null = null;
  
  async invokeOrchestrator(prompt: string): Promise<void> {
    if (this.orchestratorSessionUri) {
      // Re-open existing session
      await vscode.commands.executeCommand('workbench.action.chat.openSessionInNewWindow', {
        session: { resource: this.orchestratorSessionUri }
      });
    } else {
      // Create new session and capture URI
      await vscode.commands.executeCommand('workbench.action.newChatWindow');
      // HOW TO GET THE URI? This is the missing piece!
    }
  }
}
```

**Pros:**
- Would enable precise session targeting

**Cons:**
- **No public API to get session URI after creation**
- Internal `IChatWidgetService.getWidgetBySessionResource()` not exposed

**Status:** BLOCKED - No API available

---

### Solution D: Aggressive Tab/Window Cleanup (Current approach, enhanced)

This is what we're currently doing, but with improvements:

```typescript
async invokeOrchestrator(prompt: string): Promise<void> {
  // 1. Close ALL chat tabs in ALL editor groups
  await this.closeAllChatEditorTabs();
  
  // 2. Also close sidebar chat panel if open
  await this.closeSidebarChatIfOpen(); // NEW
  
  // 3. If orchestrator window doesn't exist, create it
  if (!this._orchestratorActive) {
    await vscode.commands.executeCommand('workbench.action.newChatWindow');
    await this.waitForWindowCreation(); // NEW - smarter wait
    this._orchestratorActive = true;
  } else {
    // 4. Verify window still exists, recreate if needed
    if (!this.verifyOrchestratorWindowExists()) { // NEW
      await vscode.commands.executeCommand('workbench.action.newChatWindow');
      await this.waitForWindowCreation();
    }
  }
  
  // 5. Now send - should go to only remaining chat (orchestrator window)
  await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt });
}
```

**Pros:**
- Already works (per test results)
- Can be enhanced with better validation

**Cons:**
- Destructive - closes user's chat tabs
- No way to verify floating window exists (no API for auxiliary windows)
- Still timing-dependent

**Status:** CURRENT - Works but fragile

---

### Solution E: Two Separate VS Code Windows

Run orchestrator and implementor in separate VS Code windows:
- Window 1: Orchestrator only
- Window 2: Implementor only

**Pros:**
- Complete isolation

**Cons:**
- Complex coordination
- Loses integrated experience
- User has to manage multiple windows

**Status:** NOT RECOMMENDED - UX too complicated

---

### Solution F: Chat Participant Delegation (Original)

Instead of invoking Copilot's agent mode, create our OWN chat participant:

```typescript
// Register our own participant
const orchestratorParticipant = vscode.chat.createChatParticipant('orchestra.orchestrator', async (request, context, stream, token) => {
  // Handle orchestrator requests directly
  // We control the session, not Copilot!
});
```

**Pros:**
- Full control over session routing (we ARE the target)
- No focus management issues

**Cons:**
- We need to delegate to Copilot's LLM, not handle requests ourselves
- Would need to forward requests to Copilot somehow

**Status:** PARTIALLY IMPLEMENTED - We have chat participants but they use Copilot's agent mode

---

## Summary: Recommended Approach

| Priority | Solution | Status | Next Step |
|----------|----------|--------|-----------|
| 1 | A: Agent-Specific Commands | NEEDS TESTING | Test `workbench.action.chat.openorchestra.*` |
| 2 | D: Enhanced Tab/Window Cleanup | CURRENT | Add sidebar closing, better timing |
| 3 | B: Background Agents | NEEDS INVESTIGATION | Research how to register background agent |
| 4 | C: Session URI Tracking | BLOCKED | Wait for API |

---

## Testing Requirements

### Test 1: Command Behavior Verification
```typescript
describe('Chat Command Behavior', () => {
  it('newChatWindow creates floating window', async () => {
    await vscode.commands.executeCommand('workbench.action.newChatWindow');
    // Verify: auxiliary window exists with chat
  });
  
  it('openChat creates editor tab', async () => {
    await vscode.commands.executeCommand('workbench.action.openChat');
    // Verify: active tab is a chat tab
  });
  
  it('chat.open targets focused chat', async () => {
    // Create two chats
    await vscode.commands.executeCommand('workbench.action.newChatWindow');
    await vscode.commands.executeCommand('workbench.action.openChat');
    
    // Send to focused (should be the tab)
    await vscode.commands.executeCommand('workbench.action.chat.open', { query: 'test' });
    
    // Verify: message went to tab, not window
  });
});
```

### Test 2: Tab Identification
```typescript
describe('Chat Tab Identification', () => {
  it('identifies chat tabs by label', async () => {
    await vscode.commands.executeCommand('workbench.action.openChat');
    
    const chatTabs = vscode.window.tabGroups.all.flatMap(g => g.tabs)
      .filter(t => t.label === 'Chat' || t.label.includes('Chat'));
    
    expect(chatTabs.length).toBeGreaterThan(0);
  });
});
```

### Test 3: Focus Flow
```typescript
describe('Focus Management', () => {
  it('closing tabs leaves window as only target', async () => {
    // Create window
    await vscode.commands.executeCommand('workbench.action.newChatWindow');
    
    // Create tab
    await vscode.commands.executeCommand('workbench.action.openChat');
    
    // Close tab
    const chatTabs = vscode.window.tabGroups.all.flatMap(g => g.tabs)
      .filter(t => t.label === 'Chat');
    await vscode.window.tabGroups.close(chatTabs, true);
    
    // Send message - should go to window
    await vscode.commands.executeCommand('workbench.action.chat.open', { query: 'test after close' });
    
    // Verify: window has the message
  });
});
```

---

## Session Resource API Tests (2025-12-30) - DEFINITIVE RESULTS

### Test 6: Tab Input Objects

```
Tab: "Chat" (group 1)
  input type: y7                    ← Minified class name
  Object.keys: (empty)              ← No enumerable properties
  getOwnPropertyNames: (empty)      ← No own properties at all
  prototype props: constructor...   ← Only constructor on prototype
```

**Conclusion:** Tab inputs are proxied/minified and **completely inaccessible**.

### Test 7: openSessionWithPrompt Commands

```
workbench.action.chat.openSessionWithPrompt.copilotcli
  → Error: Cannot read properties of undefined (reading 'scheme')

workbench.action.chat.openSessionWithPrompt.copilot-cloud-agent
  → Error: Cannot read properties of undefined (reading 'scheme')
```

**Conclusion:** These commands expect to be invoked from an existing session context (e.g., menu action). They **cannot create new sessions programmatically**.

### Test 8: Session Info Commands

```
github.copilot.chat.showAsChatSession
  → Error: Cannot read properties of undefined (reading 'with')

workbench.action.chat.renameSession
  → Result type: undefined
```

**Conclusion:** No commands return session identifiers or URIs.

### Session Commands with URIs

```
openSessionInNewWindow with URI: vscode-chat-editor:/untitled-xxx
  → Error: Cannot read properties of undefined (reading 'resource')

openSessionInSidebar with URI: vscode-local-chat-session:/sidebar-xxx
  → Error: Cannot read properties of undefined (reading 'resource')
```

**Conclusion:** Session commands do NOT accept arbitrary URIs. They require **existing session context** from the chat widget that invoked them.

---

## FINAL CONCLUSION

### What Exists (Internal)

From VS Code source code analysis, the internal `IChatWidgetService` has:

```typescript
openSession(sessionResource: URI, target?, options?): Promise<IChatWidget>
getWidgetBySessionResource(sessionResource: URI): IChatWidget | undefined
```

### What's Exposed (Public)

**NOTHING.** The public extension API provides:
- Commands that route to "currently focused" chat
- No way to get session IDs after creation
- No way to target specific sessions
- No way to inspect chat tabs for session info

### Why This Is The Case

VS Code's Chat API is designed for **user-driven interaction**, not programmatic control. The focus-based routing makes sense for the typical user flow where they're actively working in one chat.

---

## RECOMMENDED SOLUTION: Physical Isolation

Given the API limitations, the only reliable approach is **physical isolation + focus management**:

### Architecture

| Role | Location | Command to Create | Command to Send |
|------|----------|-------------------|-----------------|
| **Orchestrator** | Floating Window | `workbench.action.newChatWindow` | Focus window first |
| **Implementor** | Sidebar/Panel | `workbench.view.chat.focus` | Focus panel first |

### Implementation Strategy

```typescript
class SessionManager {
  // Track state
  private orchestratorWindowOpen = false;
  private implementorInSidebar = false;

  async sendToOrchestrator(message: string) {
    // 1. Ensure orchestrator window exists
    if (!this.orchestratorWindowOpen) {
      await vscode.commands.executeCommand('workbench.action.newChatWindow');
      this.orchestratorWindowOpen = true;
      await delay(500); // Wait for window
    }
    
    // 2. Focus the window (auxiliary window)
    // Note: VS Code doesn't provide direct focus for aux windows
    // Workaround: Track window creation and use window.focus()
    
    // 3. Send message to focused chat
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: message,
      isPartialQuery: false
    });
  }

  async sendToImplementor(message: string) {
    // 1. Ensure sidebar chat is open
    await vscode.commands.executeCommand('workbench.view.chat.focus');
    await delay(200);
    
    // 2. Send message
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: message,
      isPartialQuery: false
    });
  }
}
```

### Key Constraints

1. **Never have both in editor tabs** - They become indistinguishable
2. **Always focus before sending** - This is the only reliable routing mechanism
3. **Accept some UX friction** - Window focusing may be noticeable to users
4. **Document the limitation** - Users should understand the dual-chat setup

### Alternative: Single Chat with Context Switching

If physical isolation proves too cumbersome, consider:
- Single chat instance
- Use MCP tools to switch context (orchestrator/implementor mode)
- Prefix messages with role indicator
- Less "pure" separation but simpler UX

---

## 🎯 BREAKTHROUGH: Background Agent Sessions (2025-12-30)

### Test Results

Running the background-agent session experiment created **3 visible editor tabs**:

| Tab # | Label | Created By |
|-------|-------|------------|
| 1 | "Background Agent" | `openNewSessionEditor.copilotcli` |
| 2 | "Cloud Agent" | `openNewSessionEditor.copilot-cloud-agent` |
| 3 | "Background Agent" | `github.copilot.cli.sessions.newTerminalSession` |

The third tab shows the **Copilot CLI** terminal interface with:
- "Welcome to GitHub Copilot CLI"
- Version 0.0.372
- Connected to GitHub MCP Server
- Model: claude-sonnet-4.5 (1x)

### Why Initial Detection Failed

Our `getChatTabs()` function filtered for:
```typescript
tab.label === "Chat" || tab.label.startsWith("Copilot") || tab.label.includes("Chat")
```

But the actual tab labels are:
- **"Background Agent"** - doesn't match any filter
- **"Cloud Agent"** - doesn't match any filter

### Implications for Orchestra

This is a **paradigm shift**. We can potentially:

1. **Create dedicated Orchestrator session** using `copilotcli` → "Background Agent" tab
2. **Create dedicated Implementor session** using `copilot-cloud-agent` → "Cloud Agent" tab
3. **Identify sessions by tab label** - reliable distinction
4. **Send messages to specific tabs** by focusing the correct tab first

### Updated Detection Code

```typescript
function getAgentTabs(): vscode.Tab[] {
  const agentTabs: vscode.Tab[] = [];
  for (const tabGroup of vscode.window.tabGroups.all) {
    for (const tab of tabGroup.tabs) {
      if (
        tab.label === "Background Agent" ||
        tab.label === "Cloud Agent" ||
        tab.label === "Chat" ||
        tab.label.includes("Chat")
      ) {
        agentTabs.push(tab);
      }
    }
  }
  return agentTabs;
}
```

### Next Steps

1. **Investigate message sending** - Can we send messages to these sessions?
2. **Test session persistence** - Do sessions survive VS Code restart?
3. **Explore custom agent registration** - Can we create "Orchestra Orchestrator" and "Orchestra Implementor" sessions?
4. **Test sidebar variants** - Do `openNewSessionSidebar.*` commands create distinguishable sessions?

### Potential SessionManager Architecture

```typescript
class SessionManager {
  private orchestratorTabLabel = "Background Agent"; // copilotcli
  private implementorTabLabel = "Cloud Agent";       // copilot-cloud-agent

  async ensureOrchestratorSession(): Promise<void> {
    const tabs = this.getTabsByLabel(this.orchestratorTabLabel);
    if (tabs.length === 0) {
      await vscode.commands.executeCommand(
        'workbench.action.chat.openNewSessionEditor.copilotcli'
      );
    }
  }

  async focusOrchestrator(): Promise<void> {
    const tab = this.getTabsByLabel(this.orchestratorTabLabel)[0];
    if (tab) {
      await vscode.window.tabGroups.close([], false); // Focus tab
      // Note: Need to find actual focus mechanism
    }
  }
}
```

---

## References

- [VS Code Chat Actions](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/browser/actions/chatActions.ts)
- [Chat Widget Service](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/browser/chatWidgetService.ts)
- [Agent Sessions Model](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsModel.ts)

