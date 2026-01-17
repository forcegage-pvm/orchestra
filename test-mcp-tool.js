import { spawn } from "child_process";

const serverProcess = spawn(
  "node",
  ["dist/mcp-server/index.js", "--role", "orchestrator"],
  {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "inherit"],
  },
);

let buffer = "";

serverProcess.stdout.on("data", (data) => {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop(); // Keep incomplete line in buffer

  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        console.log(JSON.stringify(response, null, 2));
        if (response.result?.content?.[0]?.text) {
          const parsed = JSON.parse(response.result.content[0].text);
          console.log("\n=== TOOL OUTPUT ===");
          console.log(JSON.stringify(parsed, null, 2));
        }
        serverProcess.kill();
      } catch (e) {
        // Not JSON, ignore
      }
    }
  }
});

// Initialize
setTimeout(() => {
  serverProcess.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    }) + "\n",
  );
}, 100);

// Call tool after initialize
setTimeout(() => {
  serverProcess.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "get_sprint_review",
        arguments: {},
      },
    }) + "\n",
  );
}, 500);

setTimeout(() => {
  console.error("\nTimeout - killing server");
  serverProcess.kill();
  process.exit(1);
}, 5000);
