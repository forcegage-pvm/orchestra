# Visual Verification Tool Design

## Status: DRAFT

## Problem Statement

The post-mortem from Sprint 017-x-axis-unification revealed that structural and behavioral checks are insufficient for UI/rendering work:

```dart
void paint(Canvas canvas, Rect chartArea, Rect plotArea) {
  // Basic no-op implementation for now
  // Future work will add axis line rendering, tick marks, and labels
}
```

This code **passes all checks**:
- ✅ Method exists
- ✅ Signature correct
- ✅ No analyzer errors
- ✅ Unit tests pass (mocking away actual rendering)

But it **draws nothing**. The only way to catch this is **visual verification**.

## Requirements

### Core Capability

The system must be able to:
1. Launch a demo/test application
2. Capture a screenshot of the rendered UI
3. Compare against expected output
4. Report PASS/FAIL with visual diff

### Supported Scenarios

| Scenario | Method |
|----------|--------|
| **Golden Image Comparison** | Screenshot matches baseline image |
| **Visual Regression** | Screenshot matches previous version |
| **Visual Assertion** | Screenshot contains expected elements |
| **Non-Blank Verification** | Screenshot is not blank/default |

### Framework Support

| Framework | Screenshot Method |
|-----------|-------------------|
| Flutter | `flutter test --update-goldens`, integration_test screenshots |
| React/Web | Playwright, Puppeteer |
| VS Code Extension | Test automation with screenshots |
| Native Desktop | Platform-specific screen capture |

## Proposed Solution

### New Check Type: `visual_checks`

Add a fourth check category to the verification system:

```typescript
interface VisualCheck {
  description: string;
  severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO";
  
  // What to capture
  capture: {
    type: "flutter_golden" | "flutter_integration" | "playwright" | "command";
    command?: string;              // For type: "command"
    test_file?: string;            // For type: "flutter_*"
    golden_path?: string;          // Expected image location
  };
  
  // How to compare
  comparison: {
    mode: "exact" | "threshold" | "non_blank" | "contains";
    threshold_percent?: number;    // For mode: "threshold"
    expected_elements?: string[];  // For mode: "contains"
  };
}
```

### Flutter Integration

For Flutter projects, leverage the existing golden testing infrastructure:

```dart
// test/widget/x_axis_visual_test.dart
testWidgets('X-axis renders with ticks and labels', (tester) async {
  await tester.pumpWidget(
    MaterialApp(home: Scaffold(body: XAxisDemo())),
  );
  
  await expectLater(
    find.byType(XAxisDemo),
    matchesGoldenFile('goldens/x_axis_with_ticks.png'),
  );
});
```

Verification check:
```json
{
  "visual_checks": [
    {
      "description": "X-axis renders with ticks",
      "severity": "BLOCKING",
      "capture": {
        "type": "flutter_golden",
        "test_file": "test/widget/x_axis_visual_test.dart"
      },
      "comparison": {
        "mode": "threshold",
        "threshold_percent": 1.0
      }
    }
  ]
}
```

### Execution Flow

```
1. run_verification_checks called
↓
2. Structural checks run
↓
3. Behavioral checks run
↓
4. Quality checks run
↓
5. Visual checks run:
   a. Execute capture command/test
   b. Compare result against expected
   c. Generate diff image if mismatch
   d. Record PASS/FAIL
↓
6. Return combined results
```

### Visual Diff Output

On failure, provide:
- Expected image
- Actual image
- Diff image (highlighting differences)
- Difference percentage

```json
{
  "check_id": "visual-1",
  "description": "X-axis renders with ticks",
  "passed": false,
  "output": "Visual mismatch: 15.3% different",
  "artifacts": {
    "expected": ".orchestra/visual/expected/x_axis_with_ticks.png",
    "actual": ".orchestra/visual/actual/x_axis_with_ticks.png",
    "diff": ".orchestra/visual/diff/x_axis_with_ticks.png"
  }
}
```

## Non-Blank Verification Mode

For catching no-op implementations like the XAxisPainter case:

```json
{
  "visual_checks": [
    {
      "description": "XAxisPainter draws something",
      "severity": "BLOCKING",
      "capture": {
        "type": "flutter_integration",
        "test_file": "integration_test/x_axis_render_test.dart"
      },
      "comparison": {
        "mode": "non_blank",
        // Verify screenshot is not just background color
      }
    }
  ]
}
```

This would have caught the XAxisPainter no-op:
- Old X-axis: Draws lines, ticks, labels
- New X-axis: Draws nothing
- Non-blank check: **FAIL** (area is blank)

## Implementation Phases

### Phase 1: Command-Based Capture
- Add `visual_checks` to verification schema
- Execute arbitrary commands that generate screenshots
- File-based comparison (MD5 hash, image diff tools)

### Phase 2: Flutter Golden Integration
- Leverage `flutter test --update-goldens`
- Automatic golden test discovery
- Structured diff output

### Phase 3: Web/Playwright Integration
- Playwright screenshot support
- Browser automation for web UIs

### Phase 4: IDE Integration
- Display visual diffs in VS Code
- Side-by-side expected/actual/diff view
- Quick actions to update goldens

## Challenges

### 1. Cross-Platform Rendering
- Screenshots differ across platforms
- Font rendering varies
- Solution: Platform-specific goldens or fuzzy matching

### 2. Dynamic Content
- Timestamps, random IDs, animations
- Solution: Mask areas, pause animations, mock time

### 3. Golden Maintenance
- Baseline images need updating for intentional changes
- Solution: `--update-goldens` workflow, human approval

### 4. CI Environment
- Headless rendering may differ from local
- Solution: Docker containers with consistent rendering

## Database Schema Changes

```sql
-- New check_type value
-- verificationChecks.check_type now includes 'visual'

-- Artifact storage
CREATE TABLE verification_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_result_id INTEGER REFERENCES verification_results(id),
  artifact_type TEXT NOT NULL, -- 'expected', 'actual', 'diff'
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

## MCP Tool Updates

### run_verification_checks

Add visual check execution:

```typescript
// After running structural, behavioral, quality checks:

for (const visualCheck of visualChecks) {
  const result = await runVisualCheck(visualCheck, config);
  results.push(result);
  
  if (!result.passed) {
    // Store artifacts for review
    await storeVisualArtifacts(result);
  }
}
```

### get_verification_results

Include visual artifacts in output:

```typescript
{
  check_id: "visual-1",
  passed: false,
  output: "Visual mismatch: 15.3% different",
  visual_artifacts: {
    expected: "/path/to/expected.png",
    actual: "/path/to/actual.png", 
    diff: "/path/to/diff.png"
  }
}
```

## Related Documents

- [Post-Mortem: Sprint 017-x-axis-unification](../../docs/case-study/.orchestra-0.4.44/post-mortem.md)
- [Pre-Signal Executor](../../src/core/pre-signal-executor.ts)
- [Verification Checks Schema](../../src/db/schema.ts)
