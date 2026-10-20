import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/admin/api": "http://127.0.0.1:8000",
    },
  },
  test: {
    environment: "jsdom",
  },
});
