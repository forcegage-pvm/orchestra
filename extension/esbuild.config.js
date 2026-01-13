const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').BuildOptions}
 */
const baseConfig = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: "info",
  external: ["vscode", "better-sqlite3", "drizzle-orm"], // VS Code and native modules
  platform: "node",
  target: "node20",
  format: "cjs",
};

const extensionConfig = {
  ...baseConfig,
  entryPoints: ["./src/extension.ts"],
  outfile: "./dist/extension.js",
};

// Webview config - only built if webview source exists (Task 10-13)
const webviewEntryPoint = "./src/views/dashboard/webview/main.ts";
const webviewConfig = {
  ...baseConfig,
  entryPoints: [webviewEntryPoint],
  outfile: "./dist/webview.js",
  platform: "browser",
  target: "es2020",
  external: [], // Webviews don't have access to Node modules
};

async function main() {
  const hasWebview = fs.existsSync(path.resolve(__dirname, webviewEntryPoint));

  if (watch) {
    const extensionCtx = await esbuild.context(extensionConfig);
    await extensionCtx.watch();

    if (hasWebview) {
      const webviewCtx = await esbuild.context(webviewConfig);
      await webviewCtx.watch();
    }
    console.log("Watching for changes...");
  } else {
    await esbuild.build(extensionConfig);

    if (hasWebview) {
      await esbuild.build(webviewConfig);
    } else {
      console.log(
        "Webview source not found, skipping webview build (Task 10-13)"
      );
    }
    console.log("Build complete!");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
