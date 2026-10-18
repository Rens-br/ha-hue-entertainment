import { defineConfig } from "vite";

// One self-contained ES module that Home Assistant loads as the panel.
export default defineConfig({
  build: {
    lib: {
      entry: "src/panel.ts",
      formats: ["es"],
      fileName: () => "panel.js",
    },
    outDir: "../custom_components/ha_hue_entertainment/frontend",
    emptyOutDir: true,
    sourcemap: false,
  },
});
