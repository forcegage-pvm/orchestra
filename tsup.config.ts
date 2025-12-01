import { defineConfig } from "tsup";

export default defineConfig([
  // Core library
  {
    entry: ["src/core/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node18",
    outDir: "dist/core",
  },
  // CLI
  {
    entry: ["src/cli/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    target: "node18",
    outDir: "dist/cli",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  // MCP Server
  {
    entry: ["src/mcp/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    target: "node18",
    outDir: "dist/mcp",
  },
]);
