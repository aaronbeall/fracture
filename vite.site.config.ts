import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// Demo site for GitHub Pages: every examples/*.html page, with relative URLs.
const root = resolve(__dirname, "examples");
export default defineConfig({
  root,
  base: "./",
  build: {
    outDir: resolve(__dirname, "site"),
    emptyOutDir: true,
    rollupOptions: {
      input: readdirSync(root)
        .filter((file) => file.endsWith(".html"))
        .map((file) => resolve(root, file)),
    },
  },
});
