import autoprefixer from "autoprefixer";
import path from "path";
import tailwindcss from "tailwindcss";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [solid()],
  root: __dirname,
  // Use relative paths for assets - critical for VS Code webviews
  // which don't support absolute paths like /index.css
  base: "./",
  css: {
    postcss: {
      plugins: [
        tailwindcss(path.resolve(__dirname, "./tailwind.config.js")),
        autoprefixer(),
      ],
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../../../dist/webviews/agent-panel"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: "iife",
        entryFileNames: "index.js",
        assetFileNames: "[name].[ext]",
        inlineDynamicImports: true,
      },
    },
  },
});
