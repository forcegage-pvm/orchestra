/**
 * Build bundled MCP server for extension embedding
 *
 * Creates a single standalone bundle that includes all dependencies
 * (except native modules like better-sqlite3) so it can be copied
 * to the extension and run independently.
 */

import * as esbuild from "esbuild";

async function buildMcpBundle() {
  console.log("📦 Building bundled MCP server for extension...");

  await esbuild.build({
    entryPoints: ["./src/mcp-server/index.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outfile: "./dist/mcp-server-bundle/index.js",
    sourcemap: true,
    minify: false, // Keep readable for debugging
    external: [
      "better-sqlite3", // Native module - must be external
    ],
    // Add banner to make it executable
    banner: {
      js: "#!/usr/bin/env node",
    },
  });

  console.log(
    "✅ MCP server bundle created at dist/mcp-server-bundle/index.js"
  );
}

buildMcpBundle().catch((e) => {
  console.error("❌ Build failed:", e);
  process.exit(1);
});
