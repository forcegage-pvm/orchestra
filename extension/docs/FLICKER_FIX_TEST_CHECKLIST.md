# Agent Panel Flicker Fix - Test Checklist

## Before Testing

1. ✅ Build webview: `cd extension && npm run build:webview`
2. ✅ Reload VS Code window: Press `Ctrl+R` or `Cmd+R`

## Test Scenarios

### Scenario 1: Basic Tool Call Execution

**Steps:**

1. Open agent panel
2. Execute agent that runs a tool (e.g., `get_current_task`)
3. Watch the timeline as the tool executes

**Expected:**

- ✅ "Executing get_current_task" appears
- ✅ Progress message stays visible during execution
- ✅ Progress message disappears when execution completes
- ✅ Result is collapsed by default
- ✅ Click to expand shows formatted result
- ✅ **No flickering** during execution

**Actual:**

- [ ] Pass / [ ] Fail
- Notes: ******\_\_\_******

---

### Scenario 2: High-Frequency Output (Streaming)

**Steps:**

1. Execute agent that runs `npm test` or similar command with lots of output
2. Watch the timeline as hundreds of output chunks stream in
3. Observe the terminal output display

**Expected:**

- ✅ Output chunks accumulate in a single ToolCallCard
- ✅ Only the active tool call card updates
- ✅ Other timeline items (prompts, thinking) remain completely still
- ✅ **No flickering or rebuilding** of the entire timeline
- ✅ Auto-scroll smoothly follows new output

**Actual:**

- [ ] Pass / [ ] Fail
- Notes: ******\_\_\_******

---

### Scenario 3: Multiple Tool Calls

**Steps:**

1. Execute agent that makes multiple tool calls
2. Watch as each tool call appears and executes
3. Verify each completes and shows results

**Expected:**

- ✅ Each tool call appears in timeline in correct order
- ✅ Active tool call shows progress
- ✅ Completed tool calls remain stable (no re-render)
- ✅ New tool calls append to bottom without affecting existing ones
- ✅ **No flickering when new tool calls start**

**Actual:**

- [ ] Pass / [ ] Fail
- Notes: ******\_\_\_******

---

### Scenario 4: Mixed Events (Thinking + Tools)

**Steps:**

1. Execute agent that alternates between thinking and tool calls
2. Watch the timeline as different event types appear

**Expected:**

- ✅ Thinking cards render with markdown formatting
- ✅ Tool calls render with compact header and output
- ✅ Timeline maintains chronological order
- ✅ Only new events cause UI updates
- ✅ **No flickering when switching between event types**

**Actual:**

- [ ] Pass / [ ] Fail
- Notes: ******\_\_\_******

---

### Scenario 5: Auto-Scroll Behavior

**Steps:**

1. Execute agent with lots of output
2. Scroll up manually to view previous events
3. Continue watching as new events arrive
4. Observe the "X new events" indicator
5. Click indicator to scroll to bottom

**Expected:**

- ✅ Auto-scroll pauses when user scrolls up
- ✅ New events indicator appears with count
- ✅ Screen does NOT jump during pause
- ✅ Clicking indicator smoothly scrolls to bottom
- ✅ Auto-scroll resumes after clicking
- ✅ **No flickering during pause or resume**

**Actual:**

- [ ] Pass / [ ] Fail
- Notes: ******\_\_\_******

---

### Scenario 6: JSON Result Display

**Steps:**

1. Execute tool that returns JSON (e.g., `get_current_task`)
2. Expand the result
3. Verify formatting

**Expected:**

- ✅ JSON is auto-detected (starts with `{` or `[`)
- ✅ JSON is formatted with indentation
- ✅ Code block styling applied (monospace, compact)
- ✅ Result is collapsible
- ✅ **No flickering when expanding/collapsing**

**Actual:**

- [ ] Pass / [ ] Fail
- Notes: ******\_\_\_******

---

### Scenario 7: Markdown Rendering

**Steps:**

1. Execute agent that generates markdown in prompt/thinking
2. Verify markdown is rendered, not plain text

**Expected:**

- ✅ Headers render with proper sizing
- ✅ Lists render with bullets/numbers
- ✅ Code blocks render with styling
- ✅ Links are clickable
- ✅ Compact styling matches design (small fonts, tight spacing)

**Actual:**

- [ ] Pass / [ ] Fail
- Notes: ******\_\_\_******

---

### Scenario 8: Error Handling

**Steps:**

1. Execute tool that fails (e.g., invalid parameters)
2. Watch error appear in timeline
3. Verify error display

**Expected:**

- ✅ Error card appears with red/error styling
- ✅ Error message is clearly visible
- ✅ Tool call shows "failed" status
- ✅ Other events remain stable
- ✅ **No flickering when error appears**

**Actual:**

- [ ] Pass / [ ] Fail
- Notes: ******\_\_\_******

---

### Scenario 9: Session Clear

**Steps:**

1. Execute agent and populate timeline
2. Clear the session (if available)
3. Verify timeline clears properly

**Expected:**

- ✅ Timeline clears completely
- ✅ Empty state message appears
- ✅ No console errors
- ✅ Ready for new session

**Actual:**

- [ ] Pass / [ ] Fail
- Notes: ******\_\_\_******

---

### Scenario 10: Console Verification

**Steps:**

1. Open Developer Tools Console (`Help > Toggle Developer Tools`)
2. Execute agent with various tool calls
3. Monitor console for errors/warnings

**Expected:**

- ✅ No SolidJS reconciliation warnings
- ✅ No "keys" or "For" related warnings
- ✅ No unexpected errors
- ✅ Clean console output

**Actual:**

- [ ] Pass / [ ] Fail
- Notes: ******\_\_\_******

---

## Performance Metrics

### Before Fix

- Full timeline re-render on every event
- ~58 component recreations per typical session
- Visible flickering with high-frequency updates
- Auto-scroll jumping even without new items

### After Fix

Measure the following:

1. **Flickering**: None | Minimal | Moderate | Severe
2. **Smoothness**: Very Smooth | Smooth | Choppy | Very Choppy
3. **Auto-scroll**: Perfect | Good | Jumpy | Broken
4. **Responsiveness**: Instant | Fast | Slow | Very Slow

---

## Regression Checks

Ensure existing functionality still works:

- [ ] Prompt cards display correctly
- [ ] Thinking cards show markdown
- [ ] Tool call headers show correct status/timing
- [ ] File operations display as badges
- [ ] Output chunks accumulate correctly
- [ ] Result collapse/expand works
- [ ] JSON viewer formats correctly
- [ ] Error cards display properly
- [ ] Status changes appear in timeline
- [ ] Empty state shows when no events

---

## Browser DevTools Checks

### Elements Tab

1. Inspect timeline DOM
2. Verify only new elements are added (not full replacement)
3. Check that existing elements maintain same DOM nodes

### Performance Tab

1. Record a session with tool execution
2. Look for:
   - Excessive DOM mutations
   - Long scripting tasks
   - Unnecessary layout recalculations

---

## Sign-off

**Tester Name**: ******\_\_\_******

**Date**: ******\_\_\_******

**Overall Result**: [ ] PASS [ ] FAIL

**Critical Issues Found**: ******\_\_\_******

**Recommendations**: ******\_\_\_******

---

## Debugging Tips

If flickering still occurs:

1. **Check SolidJS warnings in console**
   - Look for reconciliation issues
   - Check for missing keys

2. **Verify signal updates**

   ```typescript
   // Add temporary logging
   createEffect(() => {
     console.log("[DEBUG] toolCallKeys changed:", toolCallKeys());
   });
   ```

3. **Verify Index component is used**
   - Open TimelineView.tsx
   - Confirm `<Index each={...}>` is used (not `<For>`)

4. **Check build output**
   - Verify webview was rebuilt: `npm run build:webview`
   - Check file size matches: ~116KB for index.js
   - Reload VS Code window after build

5. **Test with reduced frequency**
   - Use a tool with less output
   - Verify basic case works before high-frequency test
