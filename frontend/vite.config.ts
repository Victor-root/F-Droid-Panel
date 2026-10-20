import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  // Inlined assets would be data: URLs, which the Content Security Policy does not allow for fonts.
  build: { assetsInlineLimit: 0 },
  server: {
    proxy: {
      "/admin/api": "http://127.0.0.1:8000",
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
