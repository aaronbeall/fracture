import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: "src/index.ts",
        algorithm: "src/algorithm.ts",
        "easter-egg": "src/easter-egg.ts",
        react: "src/react.ts",
      },
      formats: ["es"],
      fileName: (_, name) => `${name}.js`,
    },
    rollupOptions: { external: ["react", "three", "html-to-image"] },
  },
});
