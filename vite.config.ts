import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: new URL("./popup.html", import.meta.url).pathname,
        options: new URL("./options.html", import.meta.url).pathname,
        background: new URL("./src/background/service-worker.ts", import.meta.url).pathname,
        content: new URL("./src/content/leetcode-submission.ts", import.meta.url).pathname
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "background.js";
          if (chunk.name === "content") return "content.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
