# Agent Panel Flicker Fix

## Problem

The agent panel was flickering and re-rendering the entire timeline on every new event, even when only a single tool call was being updated with new output chunks.

## Root Cause

The issue had two components:

### 1. SolidJS Reconciliation Issue

The timeline was using the `<For>` component which uses **referential keying** - it tracks items by their object reference in memory. Since our `timelineItems()` memo creates a new array with new objects on every update, SolidJS couldn't determine which items were actually new vs updated, causing it to re-render everything.

### 2. Missing Reactive Signal for Tool Calls

The `sessionStore` had an `eventKeys` signal that tracked which events existed, allowing SolidJS to detect when NEW events were added. However, the `toolCalls` store had no equivalent signal, so mutations to existing tool calls (adding output chunks, updating status) couldn't be distinguished from new tool calls being added.

## Solution

### Part 1: Add toolCallKeys Signal

Added a parallel signal pattern for tool calls, matching the existing `eventKeys` approach:

```typescript
// sessionStore.ts
export const [toolCallKeys, setToolCallKeys] = createSignal<string[]>([]);

export function setToolCall(
  toolCallId: string,
  aggregate: ToolCallAggregate,
): void {
  const isNew = !toolCalls[toolCallId];
  setToolCalls(toolCallId, aggregate);
  if (isNew) {
    setToolCallKeys((prev) => [...prev, toolCallId]);
  }
}

export function clearToolCalls(): void {
  setToolCalls({});
  setToolCallKeys([]);
}
```

**Key insight**: Only update the keys signal when a NEW tool call is added, not when an existing one is updated. This allows components to distinguish between:

- New tool call added → Update UI
- Existing tool call updated (more output) → Update only that tool call's component

### Part 2: Update Protocol Handler

Changed the protocol handler to use the new `setToolCall()` helper instead of directly mutating the store:

```typescript
// protocol/handler.ts
if (updatedAggregate) {
  setToolCall(event.toolCallId, updatedAggregate); // Instead of setToolCalls(id, aggregate)
}
```

This ensures the reactive signal pattern is followed consistently.

### Part 3: Switch to Index Component

Changed TimelineView from `<For>` to `<Index>`:

```tsx
// Before: Referential keying
<For each={timelineItems()}>
  {(item, index) => renderItem(item, index())}
</For>

// After: Index-based keying
<Index each={timelineItems()}>
  {(item) => renderItem(item(), 0)}
</Index>
```

**Why this works:**

- `<Index>` uses **index-based keying** - tracks items by their position in the array
- Timeline is chronological and append-only (items are never reordered or removed)
- When a new event is added, only that specific index position needs to be rendered
- When an existing tool call updates, the array length doesn't change, so `<Index>` knows nothing new was added

## Technical Details

### SolidJS Component Comparison

| Component | Keying Strategy                   | Best For                                | Our Use Case                                 |
| --------- | --------------------------------- | --------------------------------------- | -------------------------------------------- |
| `<For>`   | Referential (by object reference) | Items that reorder or can be removed    | ❌ We create new objects every time          |
| `<Index>` | Index-based (by position)         | Append-only lists where order is stable | ✅ Timeline is chronological and append-only |

### Signal Pattern Consistency

Both events and tool calls now follow the same reactive pattern:

```typescript
// Events
const [eventKeys, setEventKeys] = createSignal<string[]>([]);
function addEvent(key: string, event: AgentEvent) {
  setEvents(key, event);
  setEventKeys((prev) => [...prev, key]);
}

// Tool Calls
const [toolCallKeys, setToolCallKeys] = createSignal<string[]>([]);
function setToolCall(id: string, aggregate: ToolCallAggregate) {
  const isNew = !toolCalls[id];
  setToolCalls(id, aggregate);
  if (isNew) {
    setToolCallKeys((prev) => [...prev, id]);
  }
}
```

## Testing

To verify the fix works:

1. **Start agent execution** with tool calls (e.g., run tests)
2. **Watch timeline** as tool output streams in chunks
3. **Expected behavior:**
   - No flickering
   - Only the active tool call component updates
   - Other timeline items remain stable
   - New events smoothly append to bottom
4. **Check console** for SolidJS warnings (should be none)

## Performance Impact

- **Before**: Full timeline re-render on every event (~58 component recreations for typical session)
- **After**: Only new timeline items render, existing items update in place
- **Auto-scroll**: Fixed to only trigger on actual new items (count increase), not internal updates

## Files Modified

1. `extension/src/webviews/agent-panel/stores/sessionStore.ts`
   - Added `toolCallKeys` signal
   - Added `setToolCall()` helper
   - Added `clearToolCalls()` helper

2. `extension/src/webviews/agent-panel/protocol/handler.ts`
   - Updated to use `setToolCall()` instead of `setToolCalls()`
   - Updated to use `clearToolCalls()` instead of `setToolCalls({})`

3. `extension/src/webviews/agent-panel/stores/index.ts`
   - Exported `toolCallKeys`, `setToolCall`, `clearToolCalls`

4. `extension/src/webviews/agent-panel/views/TimelineView.tsx`
   - Changed from `<For>` to `<Index>` component
   - Removed unnecessary wrapper div

## Lessons Learned

1. **Fine-grained reactivity requires explicit tracking**: SolidJS needs to know WHAT changed, not just that something changed
2. **Choose the right keying strategy**: Match the component to your data access pattern
3. **Parallel signals for parallel stores**: If you have a Record/Map store, track keys in a separate signal
4. **Test with high-frequency updates**: Flickering issues often only appear with rapid updates (like streaming output)

## References

- [SolidJS For Component](https://docs.solidjs.com/reference/components/for) - Referential keying
- [SolidJS Index Component](https://docs.solidjs.com/reference/components/index-component) - Index-based keying
- Specification: `specs/011-agent-panel-rework/spec.md` Section 4.1 (Tool Call Grouping)
