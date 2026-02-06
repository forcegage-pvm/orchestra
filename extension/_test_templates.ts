import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { TemplateLoader } from "./src/prompts/TemplateLoader.js";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-"));
const promptsDir = path.join(tempDir, ".orchestra", "templates", "prompts");
const partialsDir = path.join(promptsDir, "_partials");
fs.mkdirSync(partialsDir, { recursive: true });

fs.copyFileSync("templates/prompts/_partials/task-header.hbs", path.join(partialsDir, "task-header.hbs"));
fs.copyFileSync("templates/prompts/_partials/spec-protocol.hbs", path.join(partialsDir, "spec-protocol.hbs"));
fs.copyFileSync("templates/prompts/sprint-review.hbs", path.join(promptsDir, "sprint-review.hbs"));
fs.copyFileSync("templates/prompts/handover-review.hbs", path.join(promptsDir, "handover-review.hbs"));
fs.copyFileSync("templates/prompts/handover-fix.hbs", path.join(promptsDir, "handover-fix.hbs"));

const loader = new TemplateLoader({ workspaceRoot: tempDir });

// Test sprint-review
const sr = loader.render("sprint-review", {
  sprint: { sprint_id: "sprint-005", title: "My Sprint", status: "SPEC_REVIEW_FAILED" },
  reviewAttempt: 2,
});
console.log("=== sprint-review length:", sr.length);
if (!sr.includes("review_sprint_config")) throw new Error("Missing review_sprint_config");
if (!sr.includes("Review Attempt**: 2")) throw new Error("Missing reviewAttempt");
if (!sr.includes("Previous review REJECTED")) throw new Error("Missing SPEC_REVIEW_FAILED conditional");
if (!sr.includes("sprint-005")) throw new Error("Missing sprint_id");
if (!sr.includes("My Sprint")) throw new Error("Missing sprint title");
console.log("sprint-review: PASS");

// Test handover-review
const hr = loader.render("handover-review", {
  task: { task_id: 42, title: "Feature", category: "FEATURE", phase_id: "p1", status: "HANDOVER_REVIEW_FAILED" },
  sprint: { sprint_id: "s1", title: "Sprint" },
  reviewAttempt: 3,
});
console.log("=== handover-review length:", hr.length);
if (!hr.includes("review_handover")) throw new Error("Missing review_handover");
if (!hr.includes("Task 42")) throw new Error("Missing task_id");
if (!hr.includes("Review Attempt**: 3")) throw new Error("Missing reviewAttempt");if (!hr.includes("Previous review REJECTED")) throw new Error("Missing HANDOVER_REVIEW_FAILED conditional");
console.log("handover-review: PASS");

// Test handover-fix
const hf = loader.render("handover-fix", {
  task: { task_id: 42, title: "Feature", category: "FEATURE", phase_id: "p1" },
  sprint: { sprint_id: "s1", title: "Sprint" },
  rejection: { issues: ["Issue 1", "Issue 2"], recommendations: "Fix it", revision_count: 2 },
});
console.log("=== handover-fix length:", hf.length);
if (!hf.includes("get_handover")) throw new Error("Missing get_handover");
if (!hf.includes("revision 3")) throw new Error("Missing revision_count + 1, got: " + hf.match(/revision \d+/g));if (!hf.includes("Revision: 3")) throw new Error("Missing Revision: 3 in context");
if (!hf.includes('"Issue 1"')) throw new Error("Missing json issues");
if (!hf.includes('"Fix it"')) throw new Error("Missing json recommendations");
console.log("handover-fix: PASS");

// Test default reviewAttempt
const srDefault = loader.render("sprint-review", {
  sprint: { sprint_id: "s1", title: "Sprint", status: "PENDING" },
});
if (!srDefault.includes("Review Attempt**: 1")) throw new Error("Default reviewAttempt not working");console.log("default reviewAttempt: PASS");

// Cleanup
fs.rmSync(tempDir, { recursive: true, force: true });
console.log("\nAll template tests PASSED!");
