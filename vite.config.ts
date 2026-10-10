import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: "src/index.ts",
        react: "src/react.ts",
        tuning: "src/tuning.ts",
      },
      formats: ["es"],
      fileName: (_, name) => `${name}.js`,
    },
    rollupOptions: { external: ["react", "three", "html-to-image"] },
  },
});
