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
        entryFileNames: "index.js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
