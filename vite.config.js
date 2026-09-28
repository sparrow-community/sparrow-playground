import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// GitHub project Pages: https://sparrow-community.github.io/sparrow-playground/
// Override with BASE_PATH=/ for local absolute-root preview if needed.
const base = process.env.BASE_PATH || "/sparrow-playground/";

export default defineConfig({
  base,
  publicDir: "public",
  plugins: [tailwindcss()],
  assetsInclude: ["**/*.wasm.gz"],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  preview: {
    port: 4173,
  },
});
