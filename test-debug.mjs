import { handleConfigureSprint } from "./src/mcp-server/handlers/configure-sprint.js";

const input = {
  sprint: {
    id: "debug-sprint",
    name: "Debug Sprint"
  },
  phases: [{ phase_id: "p1", phase_name: "Phase 1" }],
  tasks: [
    { task_id: 1, phase_id: "p1", title: "Red", description: "test", category: "INFRASTRUCTURE", dependencies: [], tdd_red_phase: true, verification: { structural_checks: [{ description: "c", severity: "MAJOR", path: "x", pattern: ".*", min_matches: 1 }] } },
    { task_id: 2, phase_id: "p1", title: "Green", description: "impl", category: "INFRASTRUCTURE", dependencies: [], verification: { structural_checks: [{ description: "c", severity: "MAJOR", path: "x", pattern: ".*", min_matches: 1 }] } }
  ],
  tdd_relationships: [{ red_task_id: 1, green_task_id: 2 }]
};

const result = await handleConfigureSprint(input);
console.log(JSON.stringify(JSON.parse(result.content[0].text), null, 2));
