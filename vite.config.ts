import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? "/",
  build: {
    // Three core is intentionally isolated as a shared lazy vendor chunk for the two 3D previews.
    // The minified chunk is about 538 kB / 134 kB gzip, so keep the warning focused above that floor.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("three/examples/jsm/loaders") || id.includes("three/examples/jsm/libs")) {
            return "vendor-model-loaders";
          }
          if (id.includes("three")) {
            return "vendor-three";
          }
          if (id.includes("react") || id.includes("react-dom")) {
            return "vendor-react";
          }
          return "vendor";
        },
      },
    },
  },
});
