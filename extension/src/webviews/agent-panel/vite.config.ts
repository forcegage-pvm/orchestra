import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [solid()],
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, "../../../dist/webviews/agent-panel"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "index.js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
