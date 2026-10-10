import { defineConfig } from "vite";

// Single self-contained script with Three.js and html-to-image inlined.
export default defineConfig({
  build: {
    lib: {
      entry: "src/anywhere.ts",
      formats: ["iife"],
      name: "FractureAnywhere",
      fileName: () => "fracture-anywhere.js",
    },
    emptyOutDir: false,
  },
});
